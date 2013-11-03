// Copyright © 2013 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

// Handlers for websocket events.

// Let me just take a moment right here to say that I really, really miss
// decorators and macros in Go. Especially not having either.

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/hraban/lush/liblush"
)

// subscribe all websocket clients to stream data
// eg subscribe;3;stdout
func wseventSubscribe(s *server, options string) error {
	args := strings.Split(options, ";")
	if len(args) != 2 {
		return errors.New("subscribe requires 2 args")
	}
	idstr := args[0]
	streamname := args[1]
	id, _ := liblush.ParseCmdId(idstr)
	c := s.session.GetCommand(id)
	if c == nil {
		return errors.New("no such command: " + idstr)
	}
	var stream liblush.OutStream
	switch streamname {
	case "stdout":
		stream = c.Stdout()
	case "stderr":
		stream = c.Stderr()
	default:
		return errors.New("unknown stream: " + streamname)
	}
	// proxy stream data
	w := newPrefixedWriter(&s.ctrlclients, []byte("stream;"+idstr+";"+streamname+";"))
	// do not close websocket stream when command exits
	wc := newNopWriteCloser(w)
	stream.AddWriter(wc)
	return nil
}

type cmdOptions struct {
	// this one is actually only for updatecmd
	Id               liblush.CmdId `json:"nid"`
	Cmd, Name        string
	Args             []string
	StdoutScrollback int
	StderrScrollback int
	UserData         interface{}
}

// eg new;{"cmd":"echo","args":["arg1","arg2"],...}
func wseventNew(s *server, optionsJSON string) error {
	var options cmdOptions
	err := json.Unmarshal([]byte(optionsJSON), &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	c := s.session.NewCommand(options.Cmd, options.Args...)
	c.Stdout().AddWriter(liblush.Devnull)
	c.Stderr().AddWriter(liblush.Devnull)
	c.Stdout().Scrollback().Resize(options.StdoutScrollback)
	c.Stderr().Scrollback().Resize(options.StderrScrollback)
	c.SetName(options.Name)
	c.SetUserData(options.UserData)
	// broadcast newcmd message to all connected websocket clients
	w := newPrefixedWriter(&s.ctrlclients, []byte("newcmd;"))
	md, err := metacmd{c}.Metadata()
	if err != nil {
		return err
	}
	err = json.NewEncoder(w).Encode(md)
	if err != nil {
		return err
	}
	// subscribe everyone to status updates
	c.Status().NotifyChange(func(status liblush.CmdStatus) error {
		facebook := newPrefixedWriter(&s.ctrlclients, []byte("updatecmd;"))
		return json.NewEncoder(facebook).Encode(map[string]interface{}{
			"nid":    c.Id(),
			"status": cmdstatus2json(status),
		})
	})
	return nil
}

// eg setpath;["c:\foo\bar\bin", "c:\bin"]
func wseventSetpath(s *server, pathJSON string) error {
	var path []string
	err := json.Unmarshal([]byte(pathJSON), &path)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	err = setPath(path)
	if err != nil {
		return err
	}
	// broadcast new path to all connected websocket clients
	_, err = s.ctrlclients.Write([]byte("path;" + pathJSON))
	return err
}

// eg getpath;
func wseventGetpath(s *server, _ string) error {
	w := newPrefixedWriter(&s.ctrlclients, []byte("path;"))
	return json.NewEncoder(w).Encode(getPath())
}

// update command metadata like name or args or anything.
// requires at least the nid key, everything else is optional.
// eg updatecmd;{"nid":3,"name":"echo"}
func wseventUpdatecmd(s *server, cmdmetaJSON string) error {
	var options cmdOptions
	jsonbytes := []byte(cmdmetaJSON)
	// parse structurally
	err := json.Unmarshal(jsonbytes, &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	c := s.session.GetCommand(options.Id)
	if c == nil {
		return fmt.Errorf("no such command: %d", options.Id)
	}
	// parse as raw map to lookup which keys were specified
	var cm map[string]interface{}
	json.Unmarshal(jsonbytes, &cm)
	// update every key that was specified in the update object
	if cm["stdoutScrollback"] != nil {
		c.Stdout().Scrollback().Resize(options.StdoutScrollback)
	}
	if cm["stderrScrollback"] != nil {
		c.Stderr().Scrollback().Resize(options.StderrScrollback)
	}
	if cm["name"] != nil {
		c.SetName(options.Name)
	}
	if cm["userdata"] != nil {
		c.SetUserData(options.UserData)
	}
	if cm["cmd"] != nil {
		argv := c.Argv()
		argv[0] = options.Cmd
		err := c.SetArgv(argv)
		if err != nil {
			return fmt.Errorf("failed to update command: %v", err)
		}
	}
	if cm["args"] != nil {
		cmd := c.Argv()[0]
		err := c.SetArgv(append([]string{cmd}, options.Args...))
		if err != nil {
			return fmt.Errorf("failed to update args: %v", err)
		}
	}
	// broadcast command update to all connected websocket clients
	w := newPrefixedWriter(&s.ctrlclients, []byte("updatecmd;"))
	_, err = w.Write(jsonbytes)
	return err
}

// store opaque data in a session-local key/value store on server.
//
// eg setuserdata;somewindow.pos;{x: 234, y: 222}
// reply: userdata_somewindow.pos;{x: 234, y: 222}
//
// yes the name of the event caused by a setuserdata is not just "userdata" but
// it includes the key of the data set. this is weird, you may even consider
// this ugly, but its really nice cos' it leverages the websocket event
// handling system for custom events without needing an extra event system
// layered on top of it for custom events.
//
// why not make it part of the client -> server event name as well then, as in
// setuserdata_somewindow.pos, you ask? excellent question! because the server
// actually doesnt want to treat these events differently. the client does.
// thats why client -> server events are unified, and server -> client events
// are not.
//
// thats what you get when you let implementation drive spec and I have to say
// i dont think i dislike it.
//
// the only requirement to userdata key names is they can't contain a
// semicolon.
func wseventSetuserdata(s *server, argsjoined string) error {
	args := strings.SplitN(argsjoined, ";", 2)
	if len(args) != 2 {
		return errors.New("setuserdata requires two args")
	}
	s.userdata[args[0]] = args[1]
	// inform all connected clients about the updated userdata
	return wseventGetuserdata(s, args[0])
}

func wseventGetuserdata(s *server, key string) error {
	_, err := fmt.Fprintf(&s.ctrlclients, "userdata_%s;%s", key, s.userdata[key])
	return err
}

func wseventConnect(s *server, optionsJSON string) error {
	var options struct {
		From, To liblush.CmdId
		Stream   string
	}
	// parse structurally
	err := json.Unmarshal([]byte(optionsJSON), &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	from := s.session.GetCommand(options.From)
	to := s.session.GetCommand(options.To)
	if from == nil || to == nil {
		return errors.New("unknown command in to or from")
	}
	var stream liblush.OutStream
	switch options.Stream {
	case "stdout":
		stream = from.Stdout()
	case "stderr":
		stream = from.Stderr()
	default:
		return errors.New("unknown stream")
	}
	stream.AddWriter(to.Stdin())
	// notify all channels of the update
	w := newPrefixedWriter(&s.ctrlclients, []byte("updatecmd;"))
	updateinfo := map[string]interface{}{
		"nid": options.From,
		options.Stream + "to": options.To,
	}
	return json.NewEncoder(w).Encode(updateinfo)
}

// start a command
// eg start;3
func wseventStart(s *server, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	c := s.session.GetCommand(id)
	if c == nil {
		return errors.New("no such command: " + idstr)
	}
	err := c.Start()
	if err != nil {
		return fmt.Errorf("Couldn't start command: %v", err)
	}
	// status update will be sent to subscribed clients automatically
	return nil
}

// kill a running command
// eg stop;3
func wseventStop(s *server, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	c := s.session.GetCommand(id)
	if c == nil {
		return errors.New("no such command: " + idstr)
	}
	err := c.Signal(StopSignal)
	if err != nil {
		// TODO: what to do with this error?
		log.Println("Error sending signal:", err)
	}
	// status update will be sent to subscribed clients automatically
	return nil
}

// free resources associated with a command. eg:
//
//     release;3
//
// will generate a cmd_released;<id> event. eg:
//
//     cmd_released;3
//
// can not be executed while command is running.
func wseventRelease(s *server, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	err := s.session.ReleaseCommand(id)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(&s.ctrlclients, "cmd_released;%s", idstr)
	return err
}

type wsHandler func(*server, string) error

var wsHandlers = map[string]wsHandler{
	"subscribe":   wseventSubscribe,
	"new":         wseventNew,
	"setpath":     wseventSetpath,
	"getpath":     wseventGetpath,
	"updatecmd":   wseventUpdatecmd,
	"setuserdata": wseventSetuserdata,
	"getuserdata": wseventGetuserdata,
	"connect":     wseventConnect,
	"start":       wseventStart,
	"stop":        wseventStop,
	"release":     wseventRelease,
}

func parseAndHandleWsEvent(s *server, msg []byte) error {
	argv := strings.SplitN(string(msg), ";", 2)
	if len(argv) != 2 {
		return errors.New("parse error")
	}
	handler, ok := wsHandlers[argv[0]]
	if !ok {
		return errors.New("unknown command")
	}
	return handler(s, argv[1])
}

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

package main

import (
	"encoding/json"
	"errors"
	"fmt"
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
	c.Stdout().ResizeScrollbackBuffer(options.StdoutScrollback)
	c.Stderr().ResizeScrollbackBuffer(options.StderrScrollback)
	c.SetName(options.Name)
	c.SetUserData(options.UserData)
	// broadcast newcmd message to all connected websocket clients
	w := newPrefixedWriter(&s.ctrlclients, []byte("newcmd;"))
	err = json.NewEncoder(w).Encode(metacmd{c}.Metadata())
	return err
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
	// parse structurally
	err := json.Unmarshal([]byte(cmdmetaJSON), &options)
	if err != nil {
		return fmt.Errorf("malformed JSON: %v", err)
	}
	c := s.session.GetCommand(options.Id)
	if c == nil {
		return fmt.Errorf("no such command: %d", options.Id)
	}
	// parse as raw map to lookup which keys were specified
	var cm map[string]interface{}
	json.Unmarshal([]byte(cmdmetaJSON), &cm)
	// update every key that was specified in the update object
	if cm["stdoutscrollback"] != nil {
		c.Stdout().ResizeScrollbackBuffer(options.StdoutScrollback)
	}
	if cm["stderrscrollback"] != nil {
		c.Stderr().ResizeScrollbackBuffer(options.StderrScrollback)
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
	err = json.NewEncoder(w).Encode(metacmd{c}.Metadata())
	return err
}

type wsHandler func(*server, string) error

var wsHandlers = map[string]wsHandler{
	"subscribe": wseventSubscribe,
	"new":       wseventNew,
	"setpath":   wseventSetpath,
	"getpath":   wseventGetpath,
	"updatecmd": wseventUpdatecmd,
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

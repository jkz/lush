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
	"fmt"
	"html/template"
	"io/ioutil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

type server struct {
	session liblush.Session
	root    string
	tmplts  *template.Template
	web     *web.Server
	// Raw data store where client can save session data
	// gets me a long way because i trust the client
	clientdata []byte
}

func redirect(ctx *web.Context, loc *url.URL) {
	if _, ok := ctx.Params["noredirect"]; ok {
		return
	}
	loc = ctx.Request.URL.ResolveReference(loc)
	ctx.Header().Set("Location", loc.String())
	ctx.WriteHeader(303)
	fmt.Fprintf(ctx, "redirecting to %s", loc)
}

func cmdloc(c liblush.Cmd) *url.URL {
	return &url.URL{Path: fmt.Sprintf("/%d/", c.Id())}
}

func getCmd(s liblush.Session, idstr string) (liblush.Cmd, error) {
	id, _ := liblush.ParseCmdId(idstr)
	c := s.GetCommand(id)
	if c == nil {
		return nil, web.WebError{404, "no such command: " + idstr}
	}
	return c, nil
}

func handleGetRoot(ctx *web.Context) error {
	s := ctx.User.(*server)
	ch := make(chan metacmd)
	go func() {
		for _, id := range s.session.GetCommandIds() {
			ch <- metacmd{s.session.GetCommand(id)}
		}
		close(ch)
	}()
	err := s.tmplts.ExecuteTemplate(ctx, "/", ch)
	return err
}

func handleGetCmd(ctx *web.Context, idstr string) error {
	type cmdctx struct {
		Cmd          liblush.Cmd
		Stdout       string
		Stderr       string
		Connectables chan liblush.Cmd
	}
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	stdout := make([]byte, 1000)
	stderr := make([]byte, 1000)
	n := c.Stdout().Last(stdout)
	stdout = stdout[:n]
	n = c.Stderr().Last(stderr)
	stderr = stderr[:n]
	ch := make(chan liblush.Cmd)
	go func() {
		for _, id := range s.session.GetCommandIds() {
			other := s.session.GetCommand(id)
			if c.Id() != other.Id() && other.Status().Started() == nil {
				ch <- other
			}
		}
		close(ch)
	}()
	tmplCtx := cmdctx{
		Cmd:          c,
		Stdout:       string(stdout),
		Stderr:       string(stderr),
		Connectables: ch,
	}
	err := s.tmplts.ExecuteTemplate(ctx, "cmd", tmplCtx)
	return err
}

func handleGetCmdInfo(ctx *web.Context, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	ctx.Header().Set("content-type", "application/json")
	enc := json.NewEncoder(ctx)
	var info = struct {
		Started, Exited *time.Time
		Error           string `json:",omitempty"`
	}{
		Started: c.Status().Started(),
		Exited:  c.Status().Exited(),
	}
	if cerr := c.Status().Err(); cerr != nil {
		info.Error = cerr.Error()
	}
	return enc.Encode(info)
}

func handlePostStart(ctx *web.Context, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	err := c.Start()
	if err != nil {
		return err
	}
	redirect(ctx, cmdloc(c))
	return nil
}

func handlePostSend(ctx *web.Context, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return web.WebError{400, "must send to stdin"}
	}
	_, err := c.Stdin().Write([]byte(ctx.Params["data"]))
	if err != nil {
		return err
	}
	redirect(ctx, cmdloc(c))
	return nil
}

func handlePostConnect(ctx *web.Context, idstr string) error {
	s := ctx.User.(*server)
	c, err := getCmd(s.session, idstr)
	if err != nil {
		return err
	}
	var stream liblush.OutStream
	switch ctx.Params["stream"] {
	case "stdout":
		stream = c.Stdout()
	case "stderr":
		stream = c.Stderr()
	default:
		return web.WebError{400, "unknown stream"}
	}
	other, err := getCmd(s.session, ctx.Params["to"])
	if err != nil {
		return err
	}
	stream.AddPipe(other.Stdin())
	redirect(ctx, cmdloc(c))
	return nil
}

func handlePostClose(ctx *web.Context, idstr string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return web.WebError{400, "must send to stdin"}
	}
	err := c.Stdin().Close()
	if err != nil {
		return err
	}
	redirect(ctx, cmdloc(c))
	return nil
}

func handlePostNew(ctx *web.Context) error {
	s := ctx.User.(*server)
	argv := []string{}
	for i := 1; ; i++ {
		key := fmt.Sprintf("arg%d", i)
		val := ctx.Params[key]
		if val == "" {
			break
		}
		argv = append(argv, val)
	}
	c := s.session.NewCommand(ctx.Params["cmd"], argv...)
	c.Stdout().AddPipe(liblush.Devnull)
	c.Stderr().AddPipe(liblush.Devnull)
	// live dangerously die young thats the navajo spirit my friends
	i, _ := strconv.Atoi(ctx.Params["stdoutScrollback"])
	c.Stdout().ResizeScrollbackBuffer(i)
	i, _ = strconv.Atoi(ctx.Params["stderrScrollback"])
	c.Stderr().ResizeScrollbackBuffer(i)
	c.SetName(ctx.Params["name"])
	redirect(ctx, &url.URL{Path: "/"})
	ctx.Header().Set("content-type", "application/json")
	err := json.NewEncoder(ctx).Encode(metacmd{c}.Metadata())
	return err
}

func handleGetNewNames(ctx *web.Context) error {
	var bins []string
	term := ctx.Params["term"]
	for _, d := range strings.Split(os.Getenv("PATH"), string(os.PathListSeparator)) {
		fis, err := ioutil.ReadDir(d)
		if err != nil {
			// ignore unreadable dirs
			continue
		}
		for _, fi := range fis {
			name := fi.Name()
			if strings.HasPrefix(name, term) {
				bins = append(bins, fi.Name())
			}
		}
	}
	enc := json.NewEncoder(ctx)
	err := enc.Encode(bins)
	return err
}

func handleGetStream(ctx *web.Context, idstr, streamname string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	var stream liblush.OutStream
	switch streamname {
	case "stdout":
		stream = c.Stdout()
	case "stderr":
		stream = c.Stderr()
	default:
		return web.WebError{400, "No such stream: " + streamname}
	}
	n, _ := strconv.Atoi(ctx.Params["numbytes"])
	buf := make([]byte, n)
	n = stream.Last(buf)
	buf = buf[:n]
	_, err := ctx.Write(buf)
	return err
}

func handleWsStream(ctx *web.Context, idstr, streamname string) error {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return web.WebError{404, "no such command: " + idstr}
	}
	var stream liblush.OutStream
	switch streamname {
	case "stdout":
		stream = c.Stdout()
	case "stderr":
		stream = c.Stderr()
	default:
		return web.WebError{400, "No such stream: " + streamname}
	}
	stream.AddPipe(ctx.WebsockConn)
	buf := make([]byte, 1)
	ctx.WebsockConn.Read(buf)
	return nil
}

func handleGetClientdata(ctx *web.Context) error {
	s := ctx.User.(*server)
	_, err := ctx.Write(s.clientdata)
	return err
}

func handlePostClientdata(ctx *web.Context) error {
	s := ctx.User.(*server)
	s.clientdata = []byte(ctx.Params["data"])
	return nil
}

func handlePostChdir(ctx *web.Context) error {
	s := ctx.User.(*server)
	return s.session.Chdir(ctx.Params["dir"])
}

func init() {
	serverinitializers = append(serverinitializers, func(s *server) {
		s.web.Get(`/`, handleGetRoot)
		s.web.Get(`/(\d+)/`, handleGetCmd)
		s.web.Get(`/(\d+)/info.json`, handleGetCmdInfo)
		s.web.Post(`/(\d+)/start`, handlePostStart)
		s.web.Post(`/(\d+)/send`, handlePostSend)
		s.web.Post(`/(\d+)/connect`, handlePostConnect)
		s.web.Post(`/(\d+)/close`, handlePostClose)
		s.web.Post(`/new`, handlePostNew)
		s.web.Get(`/new/names.json`, handleGetNewNames)
		s.web.Websocket(`/(\d+)/stream/(\w+).bin`, handleWsStream)
		s.web.Get(`/(\d+)/stream/(\w+).bin`, handleGetStream)
		s.web.Get(`/clientdata`, handleGetClientdata)
		s.web.Post(`/clientdata`, handlePostClientdata)
		s.web.Post(`/chdir`, handlePostChdir)
	})
}

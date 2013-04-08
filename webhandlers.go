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
	"fmt"
	"html/template"
	"net/url"

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

type server struct {
	session liblush.Session
	root    string
	tmplts  *template.Template
	web     *web.Server
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

func handleGetRoot(ctx *web.Context) (string, error) {
	s := ctx.User.(*server)
	c := make(chan liblush.Cmd)
	go func() {
		for _, id := range s.session.GetCommandIds() {
			c <- s.session.GetCommand(id)
		}
		close(c)
	}()
	err := s.tmplts.ExecuteTemplate(ctx, "/", c)
	if err != nil {
		return "", err
	}
	return "", nil
}

func handleGetCmd(ctx *web.Context, idstr string) (string, error) {
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
		return "", web.WebError{404, "no such command: " + idstr}
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
	return "", err
}

func handlePostStart(ctx *web.Context, idstr string) (string, error) {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return "", web.WebError{404, "no such command: " + idstr}
	}
	err := c.Start()
	if err != nil {
		return err.Error(), nil
	}
	redirect(ctx, cmdloc(c))
	return "", nil
}

func handlePostSend(ctx *web.Context, idstr string) (string, error) {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return "", web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return "", web.WebError{400, "must send to stdin"}
	}
	_, err := c.Write([]byte(ctx.Params["data"]))
	if err != nil {
		return err.Error(), nil
	}
	redirect(ctx, cmdloc(c))
	return "", nil
}

func handlePostConnect(ctx *web.Context, idstr string) (string, error) {
	s := ctx.User.(*server)
	c, err := getCmd(s.session, idstr)
	if err != nil {
		return "", err
	}
	if ctx.Params["stream"] != "stdout" {
		return "", web.WebError{400, "can only connect stdout"}
	}
	other, err := getCmd(s.session, ctx.Params["to"])
	if err != nil {
		return "", err
	}
	c.Stdout().SetPipe(other)
	redirect(ctx, cmdloc(c))
	return "", nil
}

func handlePostClose(ctx *web.Context, idstr string) (string, error) {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(*server)
	c := s.session.GetCommand(id)
	if c == nil {
		return "", web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return "", web.WebError{400, "must send to stdin"}
	}
	err := c.Close()
	if err != nil {
		return err.Error(), nil
	}
	redirect(ctx, cmdloc(c))
	return "", nil
}

func handlePostNew(ctx *web.Context) (string, error) {
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
	s.session.NewCommand(ctx.Params["name"], argv...)
	redirect(ctx, &url.URL{Path: "/"})
	return "", nil
}

func init() {
	serverinitializers = append(serverinitializers, func(s *server) {
		s.web.Get(`/`, handleGetRoot)
		s.web.Get(`/(\d+)/`, handleGetCmd)
		s.web.Post(`/(\d+)/start`, handlePostStart)
		s.web.Post(`/(\d+)/send`, handlePostSend)
		s.web.Post(`/(\d+)/connect`, handlePostConnect)
		s.web.Post(`/(\d+)/close`, handlePostClose)
		s.web.Post(`/new`, handlePostNew)
	})
}

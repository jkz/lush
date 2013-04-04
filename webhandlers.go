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

var tmplts = template.Must(template.ParseGlob("templates/*.html"))

func redirect(ctx *web.Context, loc *url.URL) {
	if _, ok := ctx.Params["noredirect"]; ok {
		return
	}
	loc = ctx.Request.URL.ResolveReference(loc)
	ctx.Header().Set("Location", loc.String())
	ctx.WriteHeader(303)
	fmt.Fprintf(ctx, "redirecting to %s", loc)
}

func handleGetRoot(ctx *web.Context) (string, error) {
	s := ctx.User.(liblush.Session)
	c := make(chan liblush.Cmd)
	go func() {
		for _, id := range s.GetCommandIds() {
			c <- s.GetCommand(id)
		}
		close(c)
	}()
	err := tmplts.ExecuteTemplate(ctx, "/", c)
	if err != nil {
		return "", err
	}
	return "", nil
}

func handleGetCmd(ctx *web.Context, idstr string) (string, error) {
	type cmdctx struct {
		Cmd    liblush.Cmd
		Stdout string
		Stderr string
	}
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(liblush.Session)
	c := s.GetCommand(id)
	if c == nil {
		return "", web.WebError{404, "no such command: " + idstr}
	}
	stdout := make([]byte, 1000)
	stderr := make([]byte, 1000)
	n := c.LastStdout(stdout)
	stdout = stdout[:n]
	n = c.LastStderr(stderr)
	stderr = stderr[:n]
	tmplCtx := cmdctx{c, string(stdout), string(stderr)}
	err := tmplts.ExecuteTemplate(ctx, "cmd", tmplCtx)
	return "", err
}

func handlePostStart(ctx *web.Context, idstr string) (string, error) {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(liblush.Session)
	c := s.GetCommand(id)
	if c == nil {
		return "", web.WebError{404, "no such command: " + idstr}
	}
	err := c.Start()
	if err != nil {
		return err.Error(), nil
	}
	redirect(ctx, &url.URL{Path: "/"})
	return "", nil
}

func handlePostSend(ctx *web.Context, idstr string) (string, error) {
	id, _ := liblush.ParseCmdId(idstr)
	s := ctx.User.(liblush.Session)
	c := s.GetCommand(id)
	if c == nil {
		return "", web.WebError{404, "no such command: " + idstr}
	}
	if ctx.Params["stream"] != "stdin" {
		return "", web.WebError{400, "must send to stdin"}
	}
	_, err := c.SendToStdin([]byte(ctx.Params["data"]))
	if err != nil {
		return err.Error(), nil
	}
	redirect(ctx, &url.URL{Path: "/" + idstr + "/"})
	return "", nil
}

func handlePostNew(ctx *web.Context) (string, error) {
	s := ctx.User.(liblush.Session)
	argv := []string{}
	for i := 1; ; i++ {
		key := fmt.Sprintf("arg%d", i)
		val := ctx.Params[key]
		if val == "" {
			break
		}
		argv = append(argv, val)
	}
	s.NewCommand(ctx.Params["name"], argv...)
	redirect(ctx, &url.URL{Path: "/"})
	return "", nil
}

func init() {
	serverinitializers = append(serverinitializers, func(s *web.Server) {
		s.Get(`/`, handleGetRoot)
		s.Get(`/(\d+)/`, handleGetCmd)
		s.Post(`/(\d+)/start`, handlePostStart)
		s.Post(`/(\d+)/send`, handlePostSend)
		s.Post(`/new`, handlePostNew)
	})
}

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

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

var tmplRoot = template.Must(template.New("/").Parse(`
<body>
{{with .}}
{{range .}}
<li><form method=post action=/{{.}}/start>{{.}} <button>start</form></li>
{{end}}
{{else}}
<p>No active commands
{{end}}
<h1>New command</h1>
<p><form method=post action=/new>
 name <input name=name><br>
 args:
   <input size=10 name=arg1>
   <input size=10 name=arg2>
   <input size=10 name=arg3><br>
 <button>prepare</button>
 </form>
<h1>misc</h1>
<p><form method=post action=/1234/start><button>test starting fake id</form>
</body>
`))

func handleGetRoot(ctx *web.Context) (string, error) {
	s := ctx.User.(liblush.Session)
	err := tmplRoot.Execute(ctx, s.GetCommandIds())
	if err != nil {
		return "", err
	}
	return "", nil
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
	return "<a href=/>continue", nil
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
	return "<a href=/>continue", nil
}

func init() {
	serverinitializers = append(serverinitializers, func(s *web.Server) {
		s.Get(`/`, handleGetRoot)
		s.Post(`/(\d+)/start`, handlePostStart)
		s.Post(`/new`, handlePostNew)
	})
}

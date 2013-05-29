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
	"go/build"
	"html/template"
	"log"
	"os"
	"runtime"

	"github.com/hraban/lush/liblush"
	"github.com/hraban/web"
)

const basePkg = "github.com/hraban/lush/"

var serverinitializers []func(*server)

// Create new PATH envvar value by adding dir to existing PATH
func appendPath(oldpath, dir string) string {
	if oldpath == "" {
		return dir
	}
	sep := ":"
	if runtime.GOOS == "windows" {
		sep = ";"
	}
	return oldpath + sep + dir
}

func main() {
	p, err := build.Default.Import(basePkg, "", build.FindOnly)
	if err != nil {
		log.Fatal("Couldn't find lush resource files: ", err)
	}
	root := p.Dir
	tmplts := template.New("")
	tmplts = template.Must(tmplts.ParseGlob(root + "/templates/*.html"))
	// also search for binaries local /bin folder
	path := os.Getenv("PATH")
	path = appendPath(path, root+"/bin")
	err = os.Setenv("PATH", path)
	if err != nil {
		log.Print("Failed to add ./bin to the PATH: ", err)
		// continue
	}
	s := &server{
		session: liblush.NewSession(),
		root:    root,
		web:     web.NewServer(),
		tmplts:  tmplts,
	}
	s.web.Config.StaticDirs = []string{root + "/static"}
	s.web.User = s
	for _, f := range serverinitializers {
		f(s)
	}
	s.web.Run("localhost:8081")
	return
}

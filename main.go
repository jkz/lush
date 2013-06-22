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
	"flag"
	"go/build"
	"html/template"
	"log"
	"os"
	"runtime"

	"bitbucket.org/kardianos/osext"
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

// find the directory containing the lush resource files. looks for a
// "templates" directory in the directory of the executable. if not found try
// to look for them in GOPATH ($GOPATH/src/github.com/....). Panics if no
// resources are found.
func resourceDir() string {
	root, err := osext.ExecutableFolder()
	if err == nil {
		if _, err = os.Stat(root + "/templates"); err == nil {
			return root
		}
	}
	// didn't find <dir of executable>/templates
	p, err := build.Default.Import(basePkg, "", build.FindOnly)
	if err != nil {
		panic("Couldn't find lush resource files")
	}
	return p.Dir
}

func main() {
	listenaddr := flag.String("l", "localhost:8081", "listen address")
	flag.Parse()
	root := resourceDir()
	tmplts := template.New("")
	tmplts = template.Must(tmplts.ParseGlob(root + "/templates/*.html"))
	// also search for binaries local /bin folder
	path := os.Getenv("PATH")
	path = appendPath(path, root+"/bin")
	err := os.Setenv("PATH", path)
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
	s.web.Run(*listenaddr)
	return
}

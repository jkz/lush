// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
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

"use strict";


// COMMAND WIDGET HELP ACTIONS

define(["jquery"], function ($) {
    var actions = {
        tar: function (cmd, $help) {
            $help.append($('<a href="http://unixhelp.ed.ac.uk/CGI/man-cgi?tar" target=_blank>online man page</a>'));
            $help.append($('<br>'));
            var $changeflag = $('<input type=checkbox>').change(function () {
                // copy array to leave cmd object intact
                var args = cmd.args.slice(0);
                if (this.checked) {
                    if (args.length == 0) {
                        args = ['x'];
                    } else if (args[0].indexOf('x') == -1) {
                        // order is important
                        args[0] = 'x' + args[0];
                    }
                } else {
                    // should always have an arg
                    if (args.length == 0) {
                        console.log('weird: unchecked extract, but no 1st arg');
                        console.log(cmd);
                    } else {
                        args[0] = args[0].replace(/x/g, '')
                    }
                }
                cmd.update({
                    args: args,
                });
            });
            $changeflag[0].checked = (cmd.args.length > 0 && cmd.args[0].indexOf('x') != -1);
            $help.append($('<label>extract: </label>').append($changeflag));
        },
        git: function (cmd, $help) {
            $help.append($('<a href="https://www.kernel.org/pub/software/scm/git/docs/" target=_blank>online man page</a>'));
            $help.append($('<br>'))
            $help.append($('<a href="">back</a>').click(function (e) {
                e.preventDefault();
            }));
        },
    };

    return function (cmd) {
        return actions[cmd.cmd] || null;
    };
})

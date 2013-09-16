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

"use strict";


// command object that keeps everything local, no server needed

define(["jquery"], function ($) {

    var LocalCommand = function (id) {
        this.nid = id;
        this.htmlid = "cmd" + id;
        this.name = "";
        this.cmd = '';
        this.args = [];
        this.status = 0;
        this.stdoutScrollback = 0;
        this.stderrScrollback = 0;
        this.userdata = {};
    };

    // update the properties of this command with those from the argument
    // object. calls the 'wasupdated' jquery event after command is updated.
    LocalCommand.prototype.update = function (updata) {
        $.extend(this, updata);
        $(this).trigger('wasupdated');
    };

    LocalCommand.prototype.getArgv = function () {
        var argv = [this.cmd];
        argv.push.apply(argv, this.args);
        return argv;
    };

    return LocalCommand;
});

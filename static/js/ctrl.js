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


// control stream related scripting

function Ctrl() {
    var ctrl = this;
    ctrl.ws = new WebSocket(wsURI('/ctrl'));
    ctrl.streamhandlers = {};
    ctrl.handlers = {};
    ctrl.ws.onmessage = function (e) {
        var x = e.data.splitn(';', 2);
        var cmd = x[0];
        var rest = x[1];
        // special case
        if (cmd == "stream") {
            if (ctrl._handleEventStream(rest)) {
                return;
            }
        } else {
            var handler = ctrl.handlers[cmd];
            if (handler) {
                handler(rest);
                return;
            }
        }
        console.log('no handler found for ctrl message: ' + e.data);
    };
}

// handle incoming event 'stream'
Ctrl.prototype._handleEventStream = function (rawmsg) {
    var x = rawmsg.splitn(';', 3);
    var handler = (this.streamhandlers[x[0]] || {})[x[1]];
    if (handler) {
        handler(x[2]);
        return true;
    }
    return false;
};

Ctrl.prototype.send = function () {
    var args = Array.prototype.slice.call(arguments);
    if (args.length == 1) {
        // needs at least 1 argument
        args.push("");
    }
    this.ws.send(args.join(';'));
};

// execute callback(data) for incoming event of this name
Ctrl.prototype.handleEvent = function (name, callback) {
    this.handlers[name] = callback;
}

// execute callback(data) for incoming stream data from this command
Ctrl.prototype.handleStream = function (id, stream, callback) {
    id = id + '';
    this.streamhandlers[id] = this.streamhandlers[id] || {};
    this.streamhandlers[id][stream] = callback;
    this.send("subscribe", id, stream);
};

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

define(["jquery", "lush/utils"], function ($) {

    var Ctrl = function () {
        var ctrl = this;
        ctrl.ws = new WebSocket(wsURI('/ctrl'));
        ctrl.streamhandlers = {};
        ctrl.ws.onmessage = function (e) {
            var x = e.data.splitn(';', 2);
            var cmd = x[0];
            var rest = x[1];
            // transform to jquery event on control stream object
            $(ctrl).trigger(cmd, rest);
        };
        ctrl.ws.onopen = function () {
            $(ctrl).trigger('open')
        };
        ctrl.ws.onclose = function () {
            $('body').attr('data-status', 'connection_error');
        };
    }

    Ctrl.prototype.send = function () {
        var ctrl = this;
        var args = Array.prototype.slice.call(arguments);
        switch (this.ws.readyState) {
        case WebSocket.OPEN:
            // send normally
            break;
        case WebSocket.CONNECTING:
            // wait for open.
            // no race bc js is single threaded
            $(ctrl).one('open', function () {
                // try again (and detach after handling)
                Ctrl.prototype.send.apply(ctrl, args)
            });
            return;
        default:
            // closing / closed? send is error
            throw "sending over closed control channel";
        }
        // normal send
        if (args.length == 1) {
            // needs at least 1 argument
            args.push("");
        }
        this.ws.send(args.join(';'));
    };

    return Ctrl;

});

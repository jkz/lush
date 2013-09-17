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


// command object synchronized with server. the properties of this object are
// not spec'ed but the y should be. instead they are implementation defined, by
// the serialization of a server-side command object to JSON. still, they
// should be treated as if that is the spec, the client is not supposed to
// start adding all kinds of new properties (use the userdata property for
// custom client data).

define(["jquery"], function ($) {

    var SyncedCommand = function (ctrl, init) {
        this.ctrl = ctrl;
        $.extend(this, init);
    };

    // update the properties of this command with those from the argument
    // object. calls the 'wasupdated' jquery event after command is updated.
    // this function is exposed for the handler of the websocket 'updatecmd'
    // event handler to call. it would be cleaner to register a handler for
    // that in the constructor of this object, but that would mean a new
    // handler for every command object that decodes the updata json just to
    // see if the nid matches. I didn't profile it but I can already feel the
    // O(n) pain.
    SyncedCommand.prototype.wasupdated = function (updata) {
        if (updata.nid !== this.nid) {
            throw "updating with foreign command data";
        }
        var updatedby;
        if (updata.userdata) {
            updatedby = updata.userdata.updatedby;
            delete updata.userdata.updatedby;
            // follow semantics of .update() method; object properties are
            // extended, not replaced.
            $.extend(this.userdata, updata.userdata);
            delete updata.userdata;
        }
        $.extend(this, updata);
        $(this).trigger('wasupdated', [updata, updatedby]);
    };

    // request an update. the first argument is an object containing the
    // properties that should be updated and their new values. because the
    // command object is not opaque (its signature is defined) the properties
    // are handled semantically: numbers, strings and arrays are replaced,
    // object properties (i.e. the userdata prop) are extended. to clear an
    // object property, set it to null. this will set the object to {}. that
    // convention makes the semantics of this method odd, but code using it is
    // more intuitive (extending the object is what you want 99% of the time).
    //
    // the second argument will be passed verbatim to the
    // wasupdated event handler as the second custom (third) argument.
    SyncedCommand.prototype.update = function (updata, by) {
        if (updata.nid !== undefined) {
            throw "updating nid not allowed!";
        }
        if (updata.userdata === null) {
            updata.userdata = {}
        } else {
            updata.userdata = $.extend({}, this.userdata, updata.userdata);
        }
        // store the updatedby key in the command userdata
        updata.userdata = $.extend(updata.userdata, {updatedby: by});
        updata.nid = this.nid;
        this.ctrl.send('updatecmd', JSON.stringify(updata));
    };

    SyncedCommand.prototype.getArgv = function () {
        var argv = [this.cmd];
        argv.push.apply(argv, this.args);
        return argv;
    };

    SyncedCommand.prototype.start = function () {
        this.ctrl.send('start', this.nid);
    };

    return SyncedCommand;
});

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
//
// the following jquery events can be subscribed to on an instance of this
// class:
//
// - wasupdated: this one is triggered whenever the command object has been
// updated. subscribe to this event if you want to stay in sync with the
// command. what exactly has been updated can be extracted from the first
// parameter (i.e. the second arg, bc its a jquery event so the first arg is
// the jquery event object). that is an object containing only the keys that
// have been updated, and their new values. this saves the poor client the
// trouble of refreshing a view that didn't change.
//
// - wasreleased: triggered when resources associated with a command have been
// released by the server and the client wants to clean up the command. any
// resources that will not be garbage collected automatically should be freed
// here.
//
// - stdout.stream / stderr.stream: called when the running command is
// generating data on the relevant streams.
//
// - archival: triggered when this command is being (un)archived. can be caused
// by a server event, by the user minimizing the widget, or by a parent widget
// being minimized. should not be propagated by registered handlers (is
// propagated by the Command object). it is triggered when the server updates
// cmd.userdata.archived (i.e. by a 'wasupdated' handler).  the parameter is a
// boolean that is true for archiving, false for unarchiving.
//
// - parentRemoved: this command is now a root. the argument is the old parent.
//
// - parentAdded: the argument is the new parent. note that commands can only
// have one parent.
//
// - childAdded: an output pipe of this command is now connected to another
// command. the first parameter is the child, the second is the name of the
// stream.
//
// - childRemoved: an output pipe is disconnected from a command. the first
// parameter is the command that was disconnected, the second is the name of
// the stream.

define(["jquery"], function ($) {

    // third arg is a uuid identifying this session
    var Command = function (ctrl, init, moi) {
        if (ctrl === undefined || init === undefined || moi === undefined) {
            throw new "Command constructor requires three parameters";
        }
        if (init.nid === undefined) {
            throw new "Init data must contain .nid field";
        }
        this.ctrl = ctrl;
        this._moi = moi;
        $.extend(this, init);
        this.gid = this.nid;
        $(this).on('parentAdded', function (_, dad) {
            this.gid = dad.gid;
        });
        $(this).on('parentRemoved', function () {
            this.gid = this.nid;
        });
    };

    Command.prototype.imadethis = function () {
        return this._moi && this._moi == this.userdata.god;
    }

    // update the state of archival on the server
    Command.prototype.setArchivalState = function (state) {
        this.update({userdata: {archived: state}});
    }

    // update the properties of this command with those from the argument
    // object. calls the 'wasupdated' jquery event after command is updated.
    // this function is exposed for the handler of the websocket 'updatecmd'
    // event handler to call. it would be cleaner to register a handler for
    // that in the constructor of this object, but that would mean a new
    // handler for every command object that decodes the updata json just to
    // see if the nid matches. I didn't profile it but I can already feel the
    // O(n) pain.
    Command.prototype.processUpdate = function (updata) {
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
        }
        // return a cmd object if argument is not undefined
        var getCmd = function (nid) {
            if (nid !== undefined) {
                return cmds[nid];
            }
        };
        // map(streamname => map({from, to} => [Command | null]))
        var childMod = {};
        if (updata.stdoutto !== undefined)
        {
            childMod.stdout = {
                from: getCmd(this.stdoutto),
                to: getCmd(updata.stdoutto),
            };
        }
        if (updata.stderrto !== undefined)
        {
            childMod.stderr = {
                from: getCmd(this.stderrto),
                to: getCmd(updata.stderrto),
            };
        }
        $.extend(this, updata);
        $(this).trigger('wasupdated', [updata, updatedby]);
        // trigger child/parent add/remove events
        var cmd = this;
        $.map(childMod, function (mod, stream) {
            if (mod.from !== undefined) {
                $(mod.from).trigger('parentRemoved', [cmd, stream]);
                $(cmd).trigger('childRemoved', [mod.from, stream]);
            }
            if (mod.to !== undefined) {
                $(mod.to).trigger('parentAdded', [cmd, stream]);
                $(cmd).trigger('childAdded', [mod.to, stream]);
            }
        });
        // If the status just updated to "successfully completed", and I am
        // god, and root, inform the server I wish to be archived.
        if (this.userdata.autoarchive &&
            updata.status == 2 &&
            this.isRoot() &&
            // only god archives a command, the rest will follow indirectly
            this.imadethis())
        {
            this.setArchivalState(true);
        }
        // if the server tells me that I've been (de)archived, generate an
        // "archival" jQuery event
        if (updata.userdata && updata.userdata.archived !== undefined) {
            if (!this.isRoot()) {
                throw "Received archival event on non-root node " + this.nid;
            }
            $(this).trigger('archival', updata.userdata.archived);
        }
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
    Command.prototype.update = function (updata, by) {
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

    Command.prototype.getArgv = function () {
        var argv = [this.cmd];
        argv.push.apply(argv, this.args);
        return argv;
    };

    Command.prototype.start = function () {
        this.ctrl.send('start', this.nid);
    };

    Command.prototype.stop = function () {
        this.ctrl.send('stop', this.nid);
    };

    Command.prototype.release = function () {
        this.ctrl.send('release', this.nid);
    };

    // called by the control stream when the server indicated that this command
    // was released. generates the jquery 'wasreleased' event on this command
    // object.
    Command.prototype.processRelease = function () {
        $(this).trigger('wasreleased')
               .unbind(); // unbind all jquery event handlers
        delete this.cmd;
        delete this.args;
        delete this.userdata;
        delete this._moi;
        delete this.ctrl;
    };

    // Called by control stream object (ctrl) when the command generated data
    // on one of its output streams (stdout / stderr). Generates a jQuery
    // event in the 'stream' namespace, name is equal to the stream
    Command.prototype.processStream = function (stream, data) {
        $(this).trigger(stream + '.stream', [data]);
    }

    // The child of this command on the given stream or undefined if none
    Command.prototype.child = function (stream) {
        var toid = this[stream + 'to'];
        if (toid !== undefined) {
            return cmds[toid];
        }
    };

    // all commands that this command is a parent of.
    Command.prototype.children = function () {
        var children = [];
        var c;
        c = this.child('stdout');
        if (c !== undefined) {
            children.push(c);
        }
        c = this.child('stderr');
        if (c !== undefined) {
            children.push(c);
        }
        return children;
    };

    Command.prototype.isRoot = function () {
        return this.gid == this.nid;
    };

    return Command;
});

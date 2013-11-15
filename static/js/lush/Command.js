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
// - updated: triggered when the command object has been updated. is triggered
// in the namespace of an updated property. e.g. the name member has been set to
// "foo": you get an 'updated.name' event. The new value can be extracted
// directly from the command object. The first parameter to the event is a
// string identifying who generated the event.
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
// propagated by the Command object). the parameter is a boolean that is true
// for archiving, false for unarchiving.
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
//
// - done: the status is updated from active to either success or error. the
// status object is passed as the argument. automatically unbinds all events
// that can now not happen anymore, including itself.
//
// TODO: This should be a Deferred object not an Event, for obvious reasons

define(["jquery"], function ($) {

    // third arg is a uuid identifying this session
    var Command = function (ctrl, init, moi) {
        var cmd = this;
        if (ctrl === undefined || init === undefined || moi === undefined) {
            throw "Command constructor requires three parameters";
        }
        if (init.nid === undefined) {
            throw "Init data must contain .nid field";
        }
        cmd.ctrl = ctrl;
        cmd._moi = moi;
        $.extend(cmd, init);
        cmd.gid = cmd.nid;
        // default values for properties
        if (!cmd.stdout) {
            cmd.stdout = '';
        }
        if (!cmd.stderr) {
            cmd.stderr = '';
        }
        if (!cmd.userdata) {
            cmd.userdata = {};
        }
        // stock event handlers
        $(cmd).on('parentAdded', function (_, dad) {
            var cmd = this;
            cmd.gid = dad.gid;
        });
        $(cmd).on('parentRemoved', function () {
            var cmd = this;
            cmd.gid = cmd.nid;
        });
        $(cmd).on('done', function () {
            var cmd = this;
            // these event handlers only make sense for running commands
            // TODO: this list is bound to grow out of sync. How to fix?
            $(cmd).off('.stream childAdded childRemoved parentAdded parentRemoved done');
        });
        $(cmd).on('updated.status', function (e) {
            var cmd = this;
            if (cmd.status.code > 1)
            {
                $(cmd).trigger('done');
                $(cmd).off(e); // no need for me anymore
            }
        });
        $(cmd).on('stdout.stream', function (_, data) {
            var cmd = this;
            cmd.stdout += data;
            $(cmd).trigger('updated.stdout', [cmd.stdout]);
        });
        $(cmd).on('stderr.stream', function (_, data) {
            var cmd = this;
            cmd.stderr += data;
            $(cmd).trigger('updated.stderr', [cmd.stderr]);
        });
    };

    Command.prototype.imadethis = function () {
        var cmd = this;
        return cmd._moi && cmd._moi == cmd.userdata.god;
    }

    // update the state of archival on the server
    Command.prototype.setArchivalState = function (state) {
        var cmd = this;
        cmd.update({userdata: {archived: state}});
    }

    // return a cmd object if argument is not undefined
    function getCmd(nid) {
        // :( pattern matching
        if (nid !== undefined) {
            return cmds[nid];
        }
    }

    function makeChildModObject(fromid, toid) {
        return {
            from: getCmd(fromid),
            to: getCmd(toid),
        };
    }

    Command.prototype.processUpdate = function (response) {
        var prop = response.prop;
        var value = response.value;
        var updatedby = response.userdata;
        var cmd = this;
        // map(streamname => map({from, to} => [Command | null]))
        var childMod = {};
        if (prop == "stdoutto") {
            childMod.stdout = 
                makeChildModObject(cmd.stdoutto, value);
        } else if (prop == "stderrto") {
            childMod.stderr = 
                makeChildModObject(cmd.stderrto, value);
        }
        cmd[prop] = value;
        // per-property update event
        $(cmd).trigger('updated.' + prop, [updatedby]);
        // trigger child/parent add/remove event if relevant
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
        if (cmd.userdata.autoarchive &&
            prop == 'status' &&
            value.code == 2 &&
            cmd.isRoot() &&
            // only god archives a command, the rest will follow indirectly
            cmd.imadethis())
        {
            cmd.setArchivalState(true);
        }
        // if the server tells me that I've been (de)archived, generate an
        // "archival" jQuery event
        if (prop == 'userdata' && value.archived !== undefined) {
            if (!cmd.isRoot()) {
                throw "Received archival event on non-root node " + cmd.nid;
            }
            $(cmd).trigger('archival', value.archived);
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
    // the second argument is a string signature of who is causing this update.
    // this is passed verbatim as the event parameter to handlers. they can use
    // that to handle some updates in special ways, e.g. the CLI view ignores
    // updates generated by editing the CLI.
    Command.prototype.update = function (updata, by) {
        var cmd = this;
        $.each(updata, function (key, val) {
            // allowed update keys
            switch (key) {
            case "userdata":
            case "name":
            case "cmd":
            case "args":
            case "stdoutScrollback":
            case "stderrScrollback":
                break;
            default:
                throw "updating illegal prop: " + key;
            }
            var req = {
                name: cmd.htmlid,
                prop: key,
                userdata: by,
            };
            // (client-side) special case for updating userdata: extend
            if (key == "userdata") {
                req.value = $.extend({}, cmd.userdata, updata.userdata);
            } else {
                req.value = val;
            }
            cmd.ctrl.send('setprop', JSON.stringify(req));
        });
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
               .off(); // unbind all jquery event handlers
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

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


// The View for command objects: small widgets in the "command columns"
//
// Every command widget is wrapped in a group widget. Within that group widget
// resides:
//
// - the command widget
// - helper nodes inserted by jsPlumb
// - the group widget of every child of the command (indirectly)
//
// eg "echo hahahajustkidding | tee /tmp/foo | mail -s 'I think you are great' root"
//
// cmd ids: echo=1, tee=2, mail=3
//
// then this is your view tree:
//
// (groupwidget1
//   (cmdwidget1)
//   (jsPlumbstuff)
//   (morejsPlumbstuff)
//   (children
//     (groupwidget2
//       (cmdwidget2)
//       .... // jsplumb stuff
//       (children
//         (groupwidget3
//           (cmdwidget3)
//           ... // jsPlumb stuff
//           )))))
//
// all this is wrapped in a <div class=rootcontainer>

define(["jquery",
        'jsPlumb',
        "lush/utils"],
       function ($) {
    // build jquery node containing [▶] button that starts cmd in background
    var makeStartButton = function (cmd) {
        return $('<button class=start>▶</button>').click(function (e) {
            $(this).html('⌚');
            $(this).prop('disabled', true);
            cmd.start();
            // stop bubbling: prevent terminal from losing focus
            return false;
        });
    };

    // build jquery node containing [◼] button that stops the cmd in background
    var makeStopButton = function (cmd) {
        return $('<button class=stop>◼</button>').click(function (e) {
            e.preventDefault();
            $(this).html('⌚');
            $(this).prop('disabled', true);
            cmd.stop();
        });
    };

    // set the status info for this command in the given jquery node's content
    var setStatNode = function (cmd, $node) {
        var content;
        switch (cmd.status.code) {
        case 0:
            content = makeStartButton(cmd);
            break;
        case 1:
            content = makeStopButton(cmd);
            break
        case 2:
            content = '✓';
            break;
        case 3:
            content = '✗';
            break;
        }
        return $node.empty().append(content);
    };

    var stream2anchor = function (stream) {
        return {stderr: "RightMiddle", stdout: "BottomCenter"}[stream]
    };

    var anchor2stream = function (anchor) {
        return {RightMiddle: "stderr", BottomCenter: "stdout"}[anchor];
    };

    // the two first arguments are the source and target endpoints to connect
    var connectVisually = function (srcep, trgtep, stream) {
        jsPlumb.connect({
            source: srcep,
            target: trgtep,
        });
    };

    // create widget with command info and add it to the DOM.
    //
    // jsPlumb endpoints: widgets have three endpoints: stdin, stdout and
    // stderr. these endoints are jsPlumb.Endpoint objects and their reference
    // is needed to connect them to eachother. this function creates the
    // endpoints and stores their reference in the cmd argument object as
    // .stdinep, .stdoutep and .stderrep.
    //
    // View is synced with command object through the relevant updated jQuery
    // events (see doc for Command constructor).
    var Widget = function (cmd, ctrl) {
        var widget = this;
        if (cmd === undefined || ctrl === undefined) {
            throw "missing argument(s) to Widget constructor";
        }
        // Fresh command widget in view mode
        widget.groupnode = $('#groupwidget_template')
              .clone()
              .attr("id", "group" + cmd.nid)[0];
        widget.node = $(widget.groupnode).find('.cmdwidget')
              .attr("id", cmd.htmlid)
              .data('activetab', "view")[0];
        widget.cmd = cmd;
        widget._initDom();
        widget._initCloseButton();
        // container for the widget when it is root. widget container will always
        // reside as a direct child of <div id=cmds>, the widget will move
        // around depending on its hierarchy. if it is root, it is here, if it
        // is a child, it is in another element's <div class=children>.
        var rootnode = $('<div class=rootcontainer id=root' + cmd.nid + '>')
            .append(widget.groupnode)
            .appendTo('#cmds')[0];
        syncPositionWithServer(rootnode, ctrl);
        widget._initJsPlumb(ctrl);
        $(cmd).on('archival', function (_, archived) {
            var cmd = this;
            if (archived) {
                $('#root' + cmd.nid).addClass('archived');
            } else {
                $('#root' + cmd.nid).removeClass('archived');
            }
        });
        $(cmd).on('wasreleased', function () {
            $(widget.groupnode).remove();
            $(widget.rootnode).remove();
            delete widget.groupnode;
            delete widget.node;
            delete widget.cmd;
        });
        function setChild(cmd, childid, streamname) {
            // I have a new child, make its group node a child of my group
            $('#group' + childid)
                .appendTo('#group' + cmd.nid + ' > .children')
                .attr('data-parent-stream', streamname);
        }
        $(cmd).on('updated.stdoutto', function () {
            var cmd = this;
            if (cmd.stdoutto) {
                setChild(cmd, cmd.stdoutto, 'stdout');
            }
        });
        $(cmd).on('updated.stderrto', function () {
            var cmd = this;
            if (cmd.stderrto) {
                setChild(cmd, cmd.stderrto, 'stderr');
            }
        });
        $(cmd).on('parentRemoved', function () {
            var cmd = this;
            // command is now root: put it back in its root container
            // (NOP if already root)
            $('#group' + cmd.nid).appendTo('#root' + cmd.nid)
                                 .removeAttr('data-parent-stream');
        });
    };

    Widget.prototype._initJsPlumb = function (ctrl) {
        var widget = this;
        var cmd = widget.cmd;
        cmd.stdinep = jsPlumb.addEndpoint(widget.node, {
            anchor: 'TopCenter',
            isTarget: true,
            parameters: {
                sysid: constantly(cmd.nid),
            },
        });
        cmd.stdoutep = jsPlumb.addEndpoint(this.node, {
            anchor: 'BottomCenter',
            isSource: true,
            parameters: {
                stream: constantly("stdout"),
                sysid: constantly(cmd.nid),
            },
        });
        cmd.stderrep = jsPlumb.addEndpoint(this.node, {
            anchor: 'RightMiddle',
            isSource: true,
            parameters: {
                stream: constantly("stderr"),
                sysid: constantly(cmd.nid),
            },
        });
        $(cmd).one('release_jsplumb', function () {
            var cmd = this;
            // custom event for releasing all jsPlumb resources, once
            [cmd.stdinep, cmd.stdoutep, cmd.stderrep]
                .forEach(jsPlumb.deleteEndpoint);
            delete cmd.stdinep;
            delete cmd.stdoutep;
            delete cmd.stderrep;
            $(widget.node).off('.jsplumb');
        }).one('done wasreleased', function () {
            var cmd = this;
            $(cmd).trigger('release_jsplumb');
        });
    };

    Widget.prototype._initDom = function () {
        var widget = this;
        var node = widget.node;
        var cmd = widget.cmd;
        // static parts of the UI (depend on constant cmd property "nid")
        $(node).find('.link').attr('href', '/' + cmd.nid + '/')
               .find('.linktext').text(cmd.nid + ': ');
        // when clicked will prepare this command for repeating (argv ->
        // prompt, focus prompt)
        $(node).find('.repeat').click(function (e) {
            e.preventDefault();
            term.set_command(cmd.getArgv().join(' ')).focus();
        });
        // dynamic parts of the UI
        $(cmd).on('updated.status', function () {
            var cmd = this;
            setStatNode(cmd, $(node).find('.status'));
        });
        $(cmd).on('updated.cmd.args', function () {
            var cmd = this;
            var argvtxt = cmd.getArgv().join(' ');
            $(node).find('.argv').text(argvtxt);
            $(node).find('.bookmark').attr('href', '#prompt;' + argvtxt);
        });
    };

    Widget.prototype._initCloseButton = function () {
        var cmd = this.cmd;
        $(this.node).find('.close').one('click', function (e) {
            e.preventDefault();
            // TODO: are you sure? Y/N
            cmd.release();
            $(this).prop('disabled', true);
        });
    };

    return Widget;

});

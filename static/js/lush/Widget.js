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


// The View for command objects.
//
// Every command widget is wrapped in a group widget. Within that group widget resides:
//
// - the command widget
// - helper nodes inserted by jsPlumb
// - the group widget of every child of the command
//
// eg "echo hahahajustkidding | tee /tmp/foo | mail -s 'I think you are great' root"
//
// cmd ids: echo=1, tee=2, mail3
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

define(["jquery",
        'lush/help',
        'jsPlumb',
        "lush/utils"],
       function ($, help) {
    // build jquery node containing [▶] button that starts cmd in background
    var makeStartButton = function (cmd) {
        return $('<button class=start>▶</button>').click(function (e) {
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
            cmd.start();
            // stop bubbling: prevent terminal from losing focus
            return false;
        });
    };

    // build jquery node containing [◼] button that stops the cmd in background
    var makeStopButton = function (cmd) {
        return $('<button class=stop>◼</button>').click(function (e) {
            e.preventDefault();
            $(e.target).html('⌚');
            $(e.target).prop('disabled', true);
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
    // Hooks view updaters to a custom jQuery event 'wasupdated'. I.e. after
    // changing the cmd run $(cmd).trigger('wasupdated') to update the UI.
    // (This is done automatically if you update the command through its
    // .update() method)
    var Widget = function (cmd, ctrl) {
        if (cmd === undefined || ctrl === undefined) {
            throw "missing argument(s) to Widget constructor";
        }
        var widget = this;
        // Fresh command widget in view mode
        this.groupnode = $('#groupwidget_template')
            .clone()
            .attr("id", "group" + cmd.nid)[0];
        this.node = $(this.groupnode).find('.cmdwidget')
            .attr("id", cmd.htmlid)
            .data('activetab', "view")[0];
        this.cmd = cmd;
        this._initView(cmd);
        // container for the widget when it is root. this container will always
        // reside as a direct child of <div id=cmds>, the widget will move
        // around depending on its hierarchy. if it is root, it is here, if it
        // is a child, it is in another element's <div class=children>.
        var rootnode = $('<div class=rootcontainer id=root' + cmd.nid + '>')
            .draggable({
                containment: "parent",
                stop: function () { storePositionOnServer(this, ctrl); },
            })
            .append(this.groupnode)
            .appendTo('#cmds')[0];
        syncPositionWithServer(rootnode, ctrl);
        this._initJsPlumb(ctrl);
        $(cmd).on('archival', function (_, archived) {
            if (archived) {
                $('#root' + this.nid).addClass('archived');
            } else {
                $('#root' + this.nid).removeClass('archived');
            }
        }).on('wasreleased', function () {
            $(widget.groupnode).remove();
            $(widget.rootnode).remove();
            delete widget.groupnode;
            delete widget.node;
            delete widget.cmd;
        }).on('parentAdded', function (_, daddy) {
            // I have a new parent, make my group node a child of its group
            $('#group' + this.nid).appendTo('#group' + daddy.nid + ' > .children');
        }).on('parentRemoved', function () {
            // command is now root: put it back in its root container
            // (NOP if already root)
            $('#group' + this.nid).appendTo('#root' + this.nid);
        });
    };

    Widget.prototype._initJsPlumb = function (ctrl) {
        var cmd = this.cmd;
        var widget = this;
        $(widget.node).on('tabsactivate.jsplumb', function () {
            jsPlumb.repaint($(this));
        }).resizable({
            resize: function () {
                jsPlumb.repaint($(this));
            }
        });
        cmd.stdinep = jsPlumb.addEndpoint(this.node, {
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

    Widget.prototype._switchToViewTab = function () {
        // view is always first. hack? who cares.
        $(this.node).tabs('option', 'active', 0);
    };

    Widget.prototype._initViewTab = function () {
        var widget = this;
        var cmd = widget.cmd;
        var $viewm = $(widget.node).find('.tab_view');
        // static parts of the UI (depend on constant cmd property "nid")
        $viewm.find('.link').attr('href', '/' + cmd.nid + '/')
              .find('.linktext').text(cmd.nid + ': ');
        // when clicked will prepare this command for repeating (argv ->
        // prompt, focus prompt)
        $viewm.find('.repeat').click(function (e) {
            e.preventDefault();
            term.set_command(cmd.getArgv().join(' ')).focus();
        });
        // dynamic parts of the UI
        $(cmd).on('updated.status', function () {
            var cmd = this;
            setStatNode(cmd, $viewm.find('.status'));
        });
        $(cmd).on('updated.cmd.args', function () {
            var cmd = this;
            var argvtxt = cmd.getArgv().join(' ');
            $viewm.find('.argv').text(argvtxt);
            $viewm.find('.bookmark').attr('href', '#prompt;' + argvtxt);
        });
    };

    Widget.prototype._initEditTab = function () {
        var widget = this;
        var cmd = widget.cmd;
        var $editm = $(widget.node).find('.tab_edit');
        $editm.find('[name=cmd]').autocomplete({source: "/new/names.json"});
        var lastarg = 1;
        var addarg = function () {
            $('[name=arg' + lastarg + ']', $editm).after(
                $('<input size=10 name=arg' + (++lastarg) + '>')
                    .one('keydown', addarg));
        };
        $editm.find('[name=arg1]').one('keydown', addarg);
        // request the command to be updated. behind the scenes this happens:
        // send "updatecmd" message over ctrl stream.  server will reply with
        // updatecmd, which will invoke a handler to update the cmd object,
        // which will invoke $(cmd).trigger('wasupdated'), which will invoke
        // the handler that updates the view for viewmode (<div
        // class=tab_view>).
        $editm.find('form').submit(function (e) {
            e.preventDefault();
            var o = $(this).serializeObject();
            // cast numeric inputs to JS ints
            $.each(o, function (key, val) {
                if (/^\d+$/.test(val)) {
                    o[key] = parseInt(val);
                }
            });
            var $args = $(this).find('input[name^=arg]');
            var args = $.map($args, attrgetter('value'));
            args = removeFalse(args);
            o.args = args;
            // set command name to argv
            o.name = o.cmd;
            for (var i = 0; i < args.length; i++) {
                o.name += ' ' + args[i];
            }
            o.userdata = $(this).data();
            o.userdata.autostart = this.autostart.checked;
            o.userdata.autoarchive = this.autoarchive.checked;
            widget.cmd.update(o);
            widget._switchToViewTab();
        });
        $(cmd).on('updated.cmd.init_edit_form', function () {
            var cmd = this;
            $editm.find('[name=cmd]').val(cmd.cmd);
        });
        $(cmd).on('updated.args.init_edit_form', function () {
            var cmd = this;
            cmd.args.forEach(function (arg, idx) {
                // keydown triggers the "create new arg input" handler
                $editm.find('[name=arg' + (idx + 1) + ']').val(arg).keydown();
            });
        });
        $(cmd).on('updated.stdoutScrollback.init_edit_form', function () {
            var cmd = this;
            $editm.find('[name=stdoutScrollback]').val(cmd.stdoutScrollback)
        });
        $(cmd).on('updated.stderrScrollback.init_edit_form', function () {
            var cmd = this;
            $editm.find('[name=stderrScrollback]').val(cmd.stderrScrollback)
        });
        $(cmd).on('updated.userdata.init_edit_form', function () {
            var cmd = this;
            $editm.find('[name=autostart]')[0].checked = cmd.userdata.autostart;
            $editm.find('[name=autoarchive]')[0].checked = cmd.userdata.autoarchive;
        });
        $editm.find('.cancelbtn').click(function () {
            $(cmd).trigger('updated.init_edit_form');
            widget._switchToViewTab();
        });
    };

    Widget.prototype._initStdoutTab = function () {
        var widget = this;
        var cmd = widget.cmd;
        $(cmd).on('updated.stdout', function (_, data) {
            var cmd = this;
            $('#' + cmd.htmlid + ' .tab_stdout .streamdata').text(data);
        });
    };

    Widget.prototype._initStderrTab = function () {
        var widget = this;
        var cmd = widget.cmd;
        $(cmd).on('updated.stderr', function (_, data) {
            var cmd = this;
            $('#' + cmd.htmlid + ' .tab_stderr .streamdata').text(data);
        });
    };

    // initialize a widget's help view
    Widget.prototype._initHelpTab = function () {
        var widget = this;
        var cmd = widget.cmd;
        $(cmd).on('updated.cmd', function () {
            var cmd = this;
            var $help = $('#' + cmd.htmlid + ' .tab_help');
            // clean out help div
            $help.empty();
            var action = help(cmd);
            if (action) {
                action(cmd, $help, function () { widget._switchToViewTab(); });
            } else {
                // todo: hide help tab?
            }
        });
    };

    Widget.prototype._initTabsNav = function () {
        var widget = this;
        var cmd = widget.cmd;
        var navlinks = $(widget.node).find('.tab-pane').map(function () {
            var tabname = $(this).data('tabname');
            // give every tab an ID (necessary for jquery.ui)
            this.id = cmd.htmlid + '_tab_' + tabname;
            var $a = $('<a>')
                .text(tabname)
                .prop('href', '#' + this.id)
                .click(function (e) {
                    e.preventDefault();
                    $(this).closest('.cmdwidget').data('activetab', $(this).text());
                });
            return $('<li>').addClass(tabname).append($a)[0];
        });
        $(widget.node).find('.tabsnav').append(navlinks);
        $(widget.node).tabs({
            activate: function (e, ui) {
                jsPlumb.repaint(this);
            },
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

    // Init the different tabs and further lay-out
    Widget.prototype._initView = function () {
        var widget = this;
        widget._initViewTab();
        widget._initEditTab();
        widget._initStdoutTab();
        widget._initStderrTab();
        widget._initHelpTab();
        widget._initTabsNav();
        widget._initCloseButton();
        $(widget.cmd).one('done', function () {
            widget._switchToViewTab();
            $(widget.node)
                .find('.tab_edit, .tab_help, .tabsnav .edit, .tabsnav .help')
                    .remove();
        });
    };

    return Widget;

});

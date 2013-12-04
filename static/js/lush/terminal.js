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


// TERMINAL HANDLING

define(["jquery",
        "lush/Parser2",
        "lush/Pool",
        "lush/utils",
        "jquery.terminal",
        "jquery.ui"],
       function ($, Parser, Pool) {
    // Print text to this terminal. Ensures the text always ends in newline.
    $.fn.termPrintln = function (text, finalize) {
        // term.echo will always append newline so strip one off if exists
        if (hassuffix(text, '\r\n')) {
            text = text.slice(0, -2);
        } else if (hassuffix(text, '\n')) {
            text = text.slice(0, -1);
        }
        text = escapeHTML(text);
        // jquery.terminal interprets square brackets
        text = text.replace(/\[/g, '&#91;');
        return this.echo(text, finalize);
    };

    // prefix all special chars in arg by backslash
    var pescape = function (txt) {
        return txt.replace(/([\\?*\s"'])/g, "\\$1");
    };

    var punescape = function (txt) {
        return txt.replace(/\\(.)/g, "$1");
    };

    var parseerror = function (msg, pos) {
        return {
            pos: pos,
            msg: msg,
        };
    };

    var startsWithDot = function (str) {
        return str[0] == ".";
    }

    // list of files matching a pattern. if showhidden is false this excludes files
    // starting with a dot. if showhidden is not specified this only shows those
    // files if the pattern itself starts with a dot.
    var glob = function (pattern, showhidden) {
        var files = [];
        $.ajax('/files.json', {
            data: {pattern: pattern},
            success: function (x) {
                files = x;
            },
            async: false});
        if (showhidden === undefined) {
            showhidden = startsWithDot(pattern);
        }
        if (!showhidden) {
            // hide files starting with a dot
            files = $.grep(files, startsWithDot, true);
        }
        return files;
    };

    // send what is currently on the prompt to the terminal output
    var echoInput = function (term) {
        return term.termPrintln(term.get_prompt() + term.get_command());
    };

    // Called with array of filenames to populate a partially completed command
    // line word as a file. The "partial" argument is the snippet the user is
    // trying to tab complete
    var tabcompleteCallback = function (term, parser, partial, files) {
        files = $.map(files, pescape);
        if (files.length == 0) {
            return;
        }
        if (files.length == 1) {
            term.insert(files[0].slice(partial.length) + " ");
            return;
        }
        var pref = lcp(files);
        if (pref.length > partial.length) {
            // all possible completions share a prefix longer than current partial
            term.insert(pref.slice(partial.length));
            return;
        }
        echoInput(term);
        $.each(files, function (_, x) { term.termPrintln(x); });
    };

    // manage context of a command line interface. purely conceptual, no UI.
    // processCmd arg is a function, called by the cli to actually invoke a
    // command (after parsing etc).
    var Cli = function (processCmd) {
        var cli = this;
        // Parser init
        cli._rawtxt = "";
        cli.parser = new Parser();
        cli.parser.oninit = function () {
            // updated after each call to setprompt()
            cli.argv = [];
            // building the next argument
            cli.newarg = '';
            // true when newarg contains a globbing char
            cli.hasglob = false;
        };
        cli.parser.onliteral = function (c) {
            // internal representation is escaped
            cli.newarg += pescape(c);
        };
        cli.parser.onglobQuestionmark = function () {
            cli.hasglob = true;
            cli.newarg += '?';
        };
        cli.parser.onglobStar = function () {
            cli.hasglob = true;
            cli.newarg += '*';
        };
        cli.parser.onboundary = function () {
            if (cli.hasglob) {
                var matches = glob(cli.newarg);
                // TODO: error if matches is empty
                cli.argv.push.apply(cli.argv, matches);
            } else {
                // undo internal escape representation
                cli.argv.push(punescape(cli.newarg));
            }
            cli.newarg = '';
        };
        // Locally identify this specific command line
        cli.guid = guid();
        // Prepared commands pool for quicker turn-around after hitting enter
        cli._cmdpool = new Pool();
        cli._processCmd = processCmd;
        // Pre-fetch five commands for the pool
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
    };

    Cli.prototype._prefetchCmd = function () {
        var cli = this;
        cli._processCmd({userdata: {creator: 'prompt'}}, cli._cmdpool.add.bind(cli._cmdpool));
    };

    // the user updated the prompt: call this method to notify the cli object
    Cli.prototype.setprompt = function (txt) {
        var cli = this;
        if (txt == cli._rawtxt) {
            // nothing changed; ignore
            return;
        }
        cli._rawtxt = txt;
        if (cli._cmd === undefined) {
            cli._prepareCmd();
        } else if (cli.cmd !== null) {
            cli.parser.parse(txt);
            cli._cmd.update({
                name: txt,
                cmd: cli.argv[0],
                args: cli.argv.slice(1),
            }, cli.guid);
        }
    };

    // try to report an error to the user
    Cli.prototype._error = function (errmsg) {
        var cli = this;
        if (cli.onerror) {
            cli.onerror(errmsg);
        } else {
            console.log("Terminal error: " + errmsg);
        }
    };

    // commit the current prompt ([enter] button)
    Cli.prototype.commit = function (txt) {
        var cli = this;
        if (!cli._cmd) {
            throw "cmd not ready";
        }
        var cmd = cli._cmd;
        cli._cmd = undefined;
        cli._prepareCmd();
        // need to re-parse because jQuery terminal triggers the "clear command
        // line" event on [enter] before the "handle command" event.
        cli.parser.parse(txt);
        if (cli.argv.length == 0) {
            return;
        }
        cmd.update({
            name: txt,
            cmd: cli.argv[0],
            args: cli.argv.slice(1),
            userdata: {
                autoarchive: true,
                starter: cli.guid,
            }
        }, cli.guid);
        cmd.start();
    }

    // connect the prompt to a command (taken from the prefetch pool)
    Cli.prototype._prepareCmd = function () {
        var cli = this;
        if (cli._cmd === null) {
            throw "command is already being prepared for cli";
        } else if (cli.cmd !== undefined) {
            throw "there is already a command associated with this cli";
        }
        cli._cmd = null; // ok I'm working on this!
        cli._cmdpool.consume(function (cmd) {
            cli._cmd = cmd;
            // when the command is started, the cli will need a new placeholder
            // command.
            $(cmd).on('updated.status.terminal', function (e) {
                var cmd = this;
                // if currently bound command is started externally
                if (cmd.status.code > 0 &&
                    cmd.userdata.starter != cli.guid &&
                    cli._cmd == cmd)
                {
                    // unbind me from the cli
                    cli._cmd = undefined;
                    // prepare a new one
                    cli._prepareCmd();
                }
                // once started, every terminal event handler is useless
                if (cmd.status.code > 0) {
                    $(cmd).unbind('.terminal');
                }
            });
            $(cli).trigger('prepared', [cmd]);
        });
        // put a new one in the pool
        cli._prefetchCmd();
    };

    // set up the terminal window
    return function (processCmd) {
        var cli = new Cli(processCmd);
        var $term = $('.terminal').terminal(function (x) {
                cli.commit(x);
            }, {
            greetings: 'Welcome to Luyat shell',
            name: 'lush',
            prompt: '$ ',
            tabcompletion: true,
            onCommandChange: function (txt) {
                try {
                    cli.setprompt(txt);
                } catch (e) {
                    // ignore errors while typing command
                }
            },
            // completion for files only (broken)
            completion: function (term) {
                var argv = parser.parse(term.get_command());
                if (!$.isArray(argv)) {
                    // parse error
                    return;
                }
                if (argv.length < 2) {
                    // only works on filenames
                    return;
                }
                var partial = argv.pop().text;
                var pattern = punescape(partial) + "*";
                // home grown callback function
                var callback = curry(tabcompleteCallback, term, parser, partial);
                $.get('/files.json', {pattern: pattern}, callback);
            },
        });
        cli.onerror = $term.error;
        // a cmd object (and widget) has been prepared for this cli
        $(cli).on('prepared', function (_, cmd) {
            // when the associated command (args or cmd) is updated from outside
            $(cmd).on('updated.args.cmd.terminal', function (e, by) {
                var cmd = this;
                if (by == cli.guid || by == 'init') {
                    // ignore init, empty updates and updates from myself
                    return;
                }
                var txt = $.map(cmd.getArgv(), pescape).join(' ');
                // hack to prevent the onCommandChange handler from sending this
                // change back to the command object. justified because the real
                // solution is a better jQuery.terminal API imo.
                var tempcli = cli;
                cli = undefined;
                $term.set_command(txt);
                cli = tempcli;
            });
        });
        return $term;
    };
});

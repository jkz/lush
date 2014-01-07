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

var cmds = {};

define(["jquery",
        "lush/Parser2",
        "lush/Cli",
        "lush/Command",
        "lush/Pool",
        "lush/utils"], function ($, Parser, Cli, Command, Pool) {
    test("lcp(): longest common prefix", function () {
        equal(lcp(["abcd", "abab", "abba"]), "ab");
        equal(lcp([]), "", "common prefix of 0 strings");
        equal(lcp(["foo", "bar"]), "");
        equal(lcp(["", "foo"]), "");
        equal(lcp(["burt", "burt"]), "burt");
    });

    test("splitn(): split string with limit", function () {
        deepEqual("a,b,c,d".splitn(",", 3), ['a', 'b', 'c,d']);
        deepEqual("a,b,c,d".splitn(",", 9), ['a', 'b', 'c', 'd']);
        deepEqual("a,b,c,d".splitn(",", 1), ['a,b,c,d']);
        deepEqual("foo".splitn("", 2), ['f', 'oo']);
        deepEqual("".splitn(",", 1), [""]);
        deepEqual("".splitn("", 1), []);
    });
    
    test("parser: argv", function() {
        // parsing context
        var ctx;
        var parser = new Parser();
        // parse a new sentence
        parser.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        // a wild character appeared! add it to the current word
        parser.onliteral = function (c) {
            ctx.newarg += c;
        };
        // all literals found up to here: you are considered a word
        parser.onboundary = function () {
            ctx.argv.push(ctx.newarg);
            ctx.newarg = '';
        };
        var t = function (raw, out, name) {
            parser.parse(raw);
            deepEqual(ctx.argv, out, name);
        };
        t("foo bar baz", ['foo', 'bar', 'baz'], 'simple parsing');
        t("foo 'bar baz'", ['foo', 'bar baz'], 'single quotes');
        t('foo "bar baz"', ['foo', 'bar baz'], 'double quotes');
        t('foo "bar"baz', ['foo', 'barbaz'], 'concatenated words');
        t('foo "bar"\'\'b""""az', ['foo', 'barbaz'], 'concatenated quotes');
        t('"\'"', ["'"], 'quoted single quote');
        t("'\"'", ['"'], 'quoted double quote');
        t('foo bar\\ baz', ['foo', 'bar baz'], 'escaped space');
        t('foo \\" bar', ['foo', '"', 'bar'], 'escaped double quotes');
        t("foo \\' bar", ['foo', "'", 'bar'], 'escaped single quote');
        t("foo \\\\ bar", ['foo', "\\", 'bar'], 'escaped backslash');
    });
    
    test("parser: globbing", function() {
        // simple parser: replace literal globbing chars by an underscore.
        // ensures that all globbing chars in the resulting argv are actually
        // intended to be globbing chars, which is all we want to test for.
        var ctx;
        var parser = new Parser();
        parser.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        parser.onliteral = function (c) {
            if (c == '*' || c == '?') {
                c = '_';
            }
            ctx.newarg += c;
        };
        parser.onglobQuestionmark = function () {
            ctx.newarg += '?';
        };
        parser.onglobStar = function () {
            ctx.newarg += '*';
        };
        parser.onboundary = function () {
            ctx.argv.push(ctx.newarg);
        };
        var t = function (raw, out, name) {
            parser.parse(raw);
            deepEqual(ctx.argv, out, name);
        };
        t('*', ['*'], 'recognize bare globbing char');
        t('\\*', ['_'], 'ignore escaped globbing char');
        t('"*"', ['_'], 'ignore quoted globbing char');
        t('foo*', ['foo*'], 'composite: word + glob');
        t('foo\\*', ['foo_'], 'composite word + literal');
        t('foo\\*bar*', ['foo_bar*'], 'composite word + glob + literal');
    });
    
    // test the indexing of globbing character positions
    test("parser: globbing char indexing", function() {
        var ctx;
        var parser = new Parser();
        parser.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        // a wild character appeared! add it to the current word
        parser.onliteral = function (c) {
            ctx.newarg += c;
        };
        // got a *
        parser.onglobStar = function (idx) {
            ctx.gotstar = idx;
        };
        // got a ?
        parser.onglobQuestionmark = function (idx) {
            ctx.gotquestionmark = idx;
        };
        parser.onglobChoice = function (choices, idx) {
            ctx.gotchoice = choices;
        };
        parser.parse('*');
        strictEqual(ctx.gotstar, 0, 'indexed wildcard: * (0)');
        parser.parse('foo*bar');
        strictEqual(ctx.gotstar, 3, 'indexed wildcard: * (3)');
        parser.parse('?');
        strictEqual(ctx.gotquestionmark, 0, 'indexed wildcard: ?');
        parser.parse('?*');
        strictEqual(ctx.gotquestionmark, 0, 'indexed wildcards: ?');
        strictEqual(ctx.gotstar, 1, 'indexed wildcards: *');
        // Not implemented yet
        //parser.parse('[abc]');
        //deepEqual(ctx.gotchoice, ['a', 'b', 'c'], 'wildcard choice: [abc]');
    });

    test("parser: pipe syntax", function() {
        var ctx;
        var parser = new Parser();
        parser.oninit = function () {
            ctx = {
                newarg: '',
            };
            ctx.cur_argv = [];
            ctx.all_argv = [ctx.cur_argv];
        };
        parser.onliteral = function (c) {
            ctx.newarg += c;
        };
        parser.onboundary = function () {
            ctx.cur_argv.push(ctx.newarg);
            ctx.newarg = '';
        };
        parser.onpipe = function () {
            ctx.cur_argv = [];
            ctx.all_argv.push(ctx.cur_argv);
        };

        parser.parse('trala blabla');
        deepEqual(ctx.all_argv, [["trala", "blabla"]], "no pipe");

        parser.parse('echo foobar | cat');
        deepEqual(ctx.all_argv, [["echo", "foobar"], ["cat"]], "pipe once");

        parser.parse('abc | yeye | ohno!');
        deepEqual(ctx.all_argv, [["abc"], ["yeye"], ["ohno!"]], "pipe twice");

        parser.parse('lookma|nospaces');
        deepEqual(ctx.all_argv, [["lookma"], ["nospaces"]], "no spaces around pipe");
    });

    // TODO: obsolete!
    (function () { test("groupname: pipe notation", function () {
        var C = function (name) {
            this.name = name;
        }
        C.prototype.child = function (name) {
            return this[name];
        }
        // eventual structure:
        //
        // c -- co  -- coo -- cooo
        // |            |
        // ce          cooe
        // |
        // cee
        //
        var c = new C('c');
        equal(groupname(c), 'c', 'single command')
        var co = new C('co');
        c.stdout = co;
        equal(groupname(c), 'c | co', 'one pipe')
        var ce = new C('ce');
        c.stderr = ce;
        equal(groupname(c), 'c | co 2| ce', 'stdout & stderr');
        var coo = new C('coo');
        co.stdout = coo;
        // test simpler pipe first
        c.stderr = undefined;
        equal(groupname(c), 'c | co | coo', 'long stdout only pipe');
        // restore
        c.stderr = ce;
        equal(groupname(c), 'c | (co | coo) 2| ce', 'nested stdout pipe')
        var cooo = new C('cooo');
        coo.stdout = cooo;
        equal(groupname(c), 'c | (co | coo | cooo) 2| ce', 'nested long pipe')
        var cooe = new C('cooe');
        coo.stderr = cooe;
        equal(groupname(c), 'c | (co | coo | cooo 2| cooe) 2| ce',
                'nested stdout & stderr')
        var cee = new C('cee');
        ce.stderr = cee;
        equal(groupname(c), 'c | (co | coo | cooo 2| cooe) 2| ce 2| cee',
            'chained stderr')
    }); });

    // Mock (websocket) control line to server
    function buildMockCtrl(handlers) {
        return {
            send: function () {
                var argv = Array.prototype.slice.call(arguments);
                // normal send
                if (argv.length == 1) {
                    // needs at least 1 argument
                    argv.push("");
                }
                var h = handlers[argv[0]];
                if (h) {
                    h(argv.slice(1));
                } else {
                    throw "websocket event not in mock: " + argv[0];
                }
            },
        };
    }

    var uniqueIds = 0;
    function buildMockCommand(init, callback) {
        // simulate server-side websocket event handlers
        var handlers = {
            setprop: function (reqjson) {
                var req = JSON.parse(reqjson);
                cmd.processUpdate(req);
            }
        };
        if (!init.nid) {
            init.nid = ++uniqueIds;
        }
        var ctrl = buildMockCtrl(handlers);
        var cmd = new Command(ctrl, init, "foo");
        if (callback) {
            callback(cmd);
        } else {
            return cmd;
        }
    }

    test("command update events", function () {
        var cmd = buildMockCommand({nid: 1, name: "echo"});

        // Setting up the callbacks
        var updatedNameEventCount = 0;
        var updatedArgsEventCount = 0;
        // a jquery event for just this property: updated.name
        $(cmd).on('updated.name', function (e, by) {
            updatedNameEventCount++;
            equal(by, "batman", "updated.name handler passed 'by' param");
        });
        // a jquery event for a property that was not updated
        $(cmd).on('updated.args', function (e, name) {
            updatedArgsEventCount++;
        });
        
        // Perform the update
        var oldCmdCopy = $.extend({}, cmd);
        var updata = {name: "echo 2"};
        cmd.update(updata, "batman");

        // Verify the effects
        equal(cmd.name, "echo 2", "name property on command is updated");
        equal(updatedNameEventCount, 1, "updated.name event triggered once");
        equal(updatedArgsEventCount, 0, 'updated.args event not triggered');
        // this is how you expect updating to work
        var updatedWithSimpleSemantics = $.extend({}, oldCmdCopy, updata);
        // poor man's deepEqual, works better for some reason that I don't care
        // about
        equal(JSON.stringify(cmd), JSON.stringify(updatedWithSimpleSemantics),
                "No extra fluff is introduced by command updating");

        cmd.update(updata, "batman");
        equal(updatedNameEventCount, 1, "ignore update() with NOP semantics");
    });

    test("command update callbacks", function () {
        var cmd = buildMockCommand({nid: 7, name: "goku"});
        var i = 0;
        cmd.update({name: "krillin"}, "the universe", function (cmdarg) {
            equal(cmdarg, cmd, "command instance passed to callback equals original command");
            i += 1;
        });
        equal(i, 1, "callback passed to update method called");
        cmd.update({name: "still krillin", args: ["something something darkside"]},
                   "Merkel", function (_, by) {
            equal(by, "Merkel", "by passed to callback");
            i += 1;
        });
        equal(i, 2, "callback function called exactly once per update");
        cmd.update({name: "still krillin"}, "", function () { i += 1; });
        equal(i, 3, "callback function also called when no properties are updated");
    });

    test("stream events", function () {
        var cmd = buildMockCommand({nid: 1, name: "echo"});

        var stdoutData = [];
        var stderrData = [];
        var stdout, stderr;
        $(cmd).on('stdout.stream', function (e, data) {
            stdoutData.push(data);
        }).on('stderr.stream', function (e, data) {
            stderrData.push(data);
        }).on('updated.stdout', function (e, data) {
            stdout = data;
        }).on('updated.stderr', function (e, data) {
            stderr = data;
        });

        cmd.processStream('stdout', 'first out, ');
        cmd.processStream('stderr', 'then err');
        cmd.processStream('stdout', 'more out');

        deepEqual(stdoutData, ['first out, ', 'more out'], "stdout.stream events for every stdout data");
        deepEqual(stderrData, ['then err'], "stderr.stream events for every stderr data");
        equal(stdout, "first out, more out", 'updated.stdout event for full stdout data');
        equal(stderr, "then err", 'updated.stderr event for full stderr data');
        equal(stdout, cmd.stdout, "updated.stdout event data and cmd.stdout member in sync");
        equal(stderr, cmd.stderr, "updated.stderr event data and cmd.stderr member in sync");
    });

    test("pool", function () {
        var testar = [];
        var consumer = function (x) { testar.push(x); };
        var pool = new Pool();
        pool.add(1);
        pool.consume(consumer);
        deepEqual(testar, [1], "consume from non-empty pool");
        pool.consume(consumer);
        pool.add(2);
        deepEqual(testar, [1,2], "consume from empty pool, then add element");
    });

    asyncTest("command-line interface model", function () {
        expect(8);
        var cli = new Cli(buildMockCommand);
        var updatedPrompt;
        cli.onUpdatedPrompt = function (txt) {
            equal(typeof txt, "string", "prompt updated with string");
            updatedPrompt = txt;
        };
        var errmsg;
        cli.onerror = function (x) {
            equal(typeof x, "string", "error message is of type string");
            error = x;
        };
        cli.setprompt("one two three").then(function () {
            ok(cli._cmd instanceof Command, "synchronized command with prompt");
            equal(cli._cmd.cmd, "one", "command name of synced command");
            deepEqual(cli._cmd.args, ["two", "three"], "args of synced command");
            ok(!cli._cmd.stdoutto, "synced command has no child");
            var def = $.Deferred();
            cli._cmd.update({args: ["tzö", "tzree"]}, "lebatman", function () {
                def.resolve(); // let's settle this, batman
            })
            return def;
        }).then(function () {
            // you know what's a good movie? that one movie about the cop that
            // tu--Prince Of The City! that's the name. great movie. people say
            // it's too long but I think it's great. good dialogues.
            equal(updatedPrompt, "one tzö tzree", "updating synced command syncs prompt");
            return cli.setprompt("blabla");
        }).then(function () {
            equal(cli._cmd.cmd, "blabla", "updated entire prompt: command");
            deepEqual(cli._cmd.args, [], "updated entire prompt: args");
            cli.setprompt("foodoofafa | haia | parapapapa");
            // ... wait---how do I test this?
        }).always(start); // qunit
    });
});

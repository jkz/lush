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

define(["lush/Parser2",
        "lush/Command",
        "lush/utils"], function (Parser, Command) {
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
        var t = function (raw, out, name) {
            parser.parse(raw);
            deepEqual(ctx.argv, out, name);
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
        parser.parse('[abc]');
        deepEqual(ctx.gotchoice, ['a', 'b', 'c'], 'wildcard choice: [abc]');
    });

    // these tests are part of a wip to define the api of the prompt (they are
    // supposed to fail)
    test("command-line interaction", function() {
        // simple prompt testing
        var ctx;
        // it is the prompt's job to translate user input to an array of words
        // (argv) that is ready to be executed. this includes:
        // - parse the input
        // - deal with tab key appropriately (auto complete, show options, etc)
        // - expand globbing chars
        var cli = new Prompt();
        // called for every fresh prompt line
        cli.oninit = function () {
            ctx = {
                argv: [],
                options: [],
            };
        };
        // called by prompt when user wants to run a command (hits enter)
        cli.onrun = function (argv) {
            ctx.argv = argv;
        };
        // called by prompt to indicate multiple options to user (eg multiple
        // options for tab completion)
        cli.onshowoptions = function (options) {
            ctx.options = options;
        };
        // called by prompt when user hits tab with current input parsed.
        // this implementation is purely for testing purposes of course in
        // reality you want something completely different
        cli.ontab = function (argv) {
            // foo -> one option, foofoo
            // nothing -> no options
            // * -> argv = all the options
            switch (argv[0]) {
            case 'foo':
                return ['foofoo'];
            case 'nothing':
                return [];
            }
            return argv;
        };

        // process command
        cli.setprompt('ls foo');
        cli.enter();
        deepEqual(ctx.argv, ['ls', 'foo'], 'simple prompt parsing + exec');

        // tab completion 1 option
        cli.setprompt('foo bar');
        cli.tab();
        equal(cli.getprompt(), 'foo foofoo ', 'tab completion 1 option: substitute input');
        deepEqual(ctx.suggestions, [], 'tab completion 1 option: nop in ui');

        // tab completion no options
        cli.setprompt('nothing bar');
        cli.tab();
        equal(cli.getprompt(), 'nothing bar', 'tab completion no options: nop on input');
        deepEqual(ctx.suggestions, [], 'tab completion no options: nop in ui');

        // tab completion: multiple options
        cli.setprompt('a b c');
        cli.tab();
        equal(cli.getprompt(), 'a b c', 'tab completion multiple options: nop on input');
        deepEqual(ctx.suggestions, ['a', 'b', 'c'], 'tab completion multiple options: show in UI');
    });

    test("groupname: pipe notation", function () {
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
    });

    test("command update events", function () {
        // mock (websocket) control line to server
        var ctrl = {
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
                    throw "unknown websocket event " + argv[0];
                }
            },
        };
        // simulate server-side websocket event handlers
        var handlers = {
            updatecmd: function (args) {
                if (args.length != 1) {
                    throw "Illegal length of argument string to updatecmd: " + args.length;
                }
                c.processUpdate(JSON.parse(args[0]));
            },
        };
        var c = new Command(ctrl, {nid: 1, name: "echo"}, "foo");
        c.update({name: "echo 2"});
        equal(c.name, "echo 2");
    });
});

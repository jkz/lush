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

define(["lush/parser", "lush/utils"], function (Parser) {
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
    
    // these tests are part of a wip to define the api of the parser (they are
    // supposed to fail)
    test("parser", function() {
        // simple parser callback: store all words in argv
        var argv;
        var callback = {
            init: function () { argv = []; },
            rawStr: function (str) { argv.push(str); },
            globStr: function (str) { argv.push(str); },
        };
        var parser = new Parser(callback);
        var t = function (raw, out, name) {
            parser.parse(raw);
            deepEqual(argv, out, name);
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

    // these tests are part of a wip to define the api of the prompt (they are
    // supposed to fail)
    test("command-line interaction", function() {
        // live command object connected to current prompt
        var cmd;
        var initNum = 0;
        // called for every fresh prompt line
        var initFunc = function (callback) {
            initNum += 1;
            cmd = {};
            callback(cmd);
        };
        var cli = new Prompt(initFunc);
        // array of suggestions (during tab completion)
        var suggestions;
        // called by prompt to indicate it wants to suggest something to user
        cli.onsuggest = function (x) {
            suggestions = x;
        };

        // tab completion
        cli.setprompt('ls foo');
        cli.tab();
        deepEqual(suggestions, ['foo1.txt', 'foo2.txt'], 'tab completion');
        // init function
        equal(initNum, 1, 'prompt init callback called once');

        // globbing
        cli.setprompt('foo*');
        equal(initNum, 1, 'prompt init callback not called again');
        cli.enter();
        deepEqual(cli.argv, ['foo1.txt', 'foo2.txt'], 'suffix *');

        cli.setprompt('foo*txt');
        equal(initNum, 2, 'prompt init callback called >1');
        cli.enter();
        deepEqual(cli.argv, ['foo1.txt', 'foo2.txt'], '* in the middle');

        cli.setprompt('*.txt');
        equal(initNum, 3, 'prompt init callback called >1');
        cli.enter();
        deepEqual(cli.argv, ['foo1.txt', 'foo2.txt'], 'prefix *');

        cli.setprompt('f*o*xt');
        equal(initNum, 4, 'prompt init callback called >1');
        cli.enter();
        deepEqual(cli.argv, ['foo1.txt', 'foo2.txt'], 'multiple *s');

        cli.setprompt('foo?.txt');
        equal(initNum, 5, 'prompt init callback called >1');
        cli.enter();
        deepEqual(cli.argv, ['foo1.txt', 'foo2.txt'], '? in the middle');

        cli.setprompt('"foo*"');
        equal(initNum, 6, 'prompt init callback called >1');
        cli.enter();
        deepEqual(cli.argv, ['foo*'], 'wildcard in quotes');
    });
});

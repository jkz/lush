var stat2html = function(id, stat) {
    switch(stat) {
    case 0:
        return '<form method=post action="/' + id + '/start" class="start-cmd"> <button>start</button> </form>';
    case 1:
        return '⌚';
    case 2:
        return '✓';
    case 3:
        return '✗';
    }
};

var storeposition = function(id, pos) {
    localStorage.setItem(id + '.left', '' + pos.left);
    localStorage.setItem(id + '.top', '' + pos.top);
};

var getposition = function(id) {
    var left = localStorage.getItem(id + '.left');
    var top = localStorage.getItem(id + '.top');
    if (left === null || top === null) {
        return null;
    }
    return {left: +left, top: +top};
};

var restoreposition = function(id) {
    var pos = getposition(id);
    if (pos !== null) {
        $('#' + id).offset(pos);
    }
};

$(document).ready(function() {
    $.map(cmds, function(cmd, i) {
        var node = $(
            '<div class="cmd" id="cmd' + cmd.id + '">' +
            '<a href="/' + cmd.id + '/">' + cmd.id + ': ' +
            '<tt>' + cmd.argv.join(" ") + '</tt></a> ' +
            stat2html(cmd.id, cmd.status) + '</p>');
        $('#cmds').append(node);
        restoreposition('cmd' + cmd.id);
        jsPlumb.draggable(node, {
            stop: function(e, ui) {
                storeposition(this.id, ui.offset);
            }});
        jsPlumb.addEndpoint('cmd' + cmd.id, {
            anchor: 'TopCenter',
            isTarget: true,
        });
        jsPlumb.addEndpoint('cmd' + cmd.id, {
            anchor: 'BottomCenter',
            isSource: true,
        });
    });
    $('form.start-cmd').submit(function(e) {
        $.post(e.target.action + "?noredirect", $(this).serialize())
         .done(function() {
             $(e.target).html('⌚');
         })
         .fail(function() {
             $(e.target).html('✗');
         });
        return false;
    });
});

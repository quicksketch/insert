/**
 * @file
 * JavaScript to activate "Insert" buttons on file and image fields.
 */

(function ($) {

/**
 * Behavior to add "Insert" buttons.
 */
Backdrop.behaviors.insert = {};
Backdrop.behaviors.insert.attach = function(context) {
  if (typeof(insertTextarea) == 'undefined') {
    insertTextarea = $('#edit-body textarea.text-full').get(0) || false;
  }

  // Keep track of the last active textarea (if not using WYSIWYG).
  $('textarea:not([name$="[data][title]"]):not(.insert-processed)', context).addClass('insert-processed').focus(insertSetActive).blur(insertRemoveActive);

  // Add the click handler to the insert button.
  $('.insert-button:not(.insert-processed)', context).addClass('insert-processed').click(insert);

  // CKEditor 5 does not keep track of the last active editor.
  // See https://github.com/backdrop/backdrop-issues/issues/6770
  // Keep track of the last-focused CKEditor 5 instance.
  if (typeof(insertCKEditor) === 'undefined') {
    insertCKEditor = false;
  }
  if (typeof(Backdrop.ckeditor5) !== 'undefined') {
    // We need to wait until the CKEditor instance is created. A basic timeout
    // is used here, but it's not guaranteed the instance will exist yet.
    window.setTimeout(function() {
      Backdrop.ckeditor5.instances.forEach(function (editor, editorId) {
        if (!editor.insertEnabled) {
          editor.insertEnabled = true;
          editor.editing.view.document.on('change:isFocused', function (evt, data, isFocused) {
            if (isFocused) {
              insertCKEditor = editor;
            }
          });
        }
      });
    }, 2000);
  }

  function insertSetActive() {
    insertTextarea = this;
    this.insertHasFocus = true;
  }

  function insertRemoveActive() {
    if (insertTextarea == this) {
      var thisTextarea = this;
      setTimeout(function() {
        thisTextarea.insertHasFocus = false;
      }, 1000);
    }
  }

  function insert() {
    var widgetType = $(this).attr('rel');
    var settings = Backdrop.settings.insert.widgets[widgetType];
    var wrapper = $(this).parents(settings.wrapper).filter(':first').get(0);
    var style = $('.insert-style', wrapper).val();
    var content = $('input.insert-template[name$="[' + style + ']"]', wrapper).val();
    var filename = $('input.insert-filename', wrapper).val();
    var options = {
      widgetType: widgetType,
      filename: filename,
      style: style,
      fields: {}
    };

    // Update replacements.
    for (var fieldName in settings.fields) {
      var fieldValue = $(settings.fields[fieldName], wrapper).val();
      if (fieldValue) {
        fieldValue = fieldValue
          .replace(/&/g, '&amp;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }
      options['fields'][fieldName] = fieldValue;
      if (fieldValue) {
        var fieldRegExp = new RegExp('__' + fieldName + '(_or_filename)?__', 'g');
        content = content.replace(fieldRegExp, fieldValue);
      }
      else {
        var fieldRegExp = new RegExp('__' + fieldName + '_or_filename__', 'g');
        content = content.replace(fieldRegExp, filename);
      }
    }

    // File name replacement.
    var fieldRegExp = new RegExp('__filename__', 'g');
    content = content.replace(fieldRegExp, filename);

    // Check for a maximum dimension and scale down the width if necessary.
    // This is intended for use with Image Resize Filter.
    var widthMatches = content.match(/width[ ]*=[ ]*"(\d*)"/i);
    var heightMatches = content.match(/height[ ]*=[ ]*"(\d*)"/i);
    if (settings.maxWidth && widthMatches && parseInt(widthMatches[1]) > settings.maxWidth) {
      var insertRatio = settings.maxWidth / widthMatches[1];
      var width = settings.maxWidth;
      content = content.replace(/width[ ]*=[ ]*"?(\d*)"?/i, 'width="' + width + '"');

      if (heightMatches) {
        var height = Math.round(heightMatches[1] * insertRatio);
        content = content.replace(/height[ ]*=[ ]*"?(\d*)"?/i, 'height="' + height + '"');
      }
    }

    // Allow other modules to perform replacements.
    options['content'] = content;
    $.event.trigger('insertIntoActiveEditor', [options]);
    content = options['content'];

    // Cleanup unused replacements.
    content = content.replace(/__([a-z0-9_]+)__/g, '');

    // Cleanup empty attributes (other than alt).
    content = content.replace(/([a-z]+)[ ]*=[ ]*""/g, function(match, tagName) {
      return (tagName === 'alt') ? match : '';
    });

    // Insert the text.
    Backdrop.insert.insertIntoActiveEditor(content);
  }
};

// General Insert API functions.
Backdrop.insert = {
  /**
   * Insert content into the current (or last active) editor on the page. This
   * should work with most WYSIWYGs as well as plain textareas.
   *
   * @param content
   */
  insertIntoActiveEditor: function(content) {
    var editorElement;

    // Always work in normal text areas that currently have focus.
    if (insertTextarea && insertTextarea.insertHasFocus) {
      editorElement = insertTextarea;
      Backdrop.insert.insertAtCursor(insertTextarea, content);
    }
    // Direct tinyMCE support.
    else if (typeof(tinyMCE) != 'undefined' && tinyMCE.activeEditor) {
      editorElement = document.getElementById(tinyMCE.activeEditor.editorId);
      Backdrop.insert.activateTabPane(editorElement);
      tinyMCE.activeEditor.execCommand('mceInsertContent', false, content);
    }
    // CKEditor 5 module support.
    // See https://ckeditor.com/docs/ckeditor5/latest/framework/how-tos.html#how-to-insert-some-content-into-the-editor
    else if (insertCKEditor && insertCKEditor.sourceElement) {
      Backdrop.insert.activateTabPane(insertCKEditor.sourceElement);
      var insertPosition = insertCKEditor.model.document.selection.getFirstPosition();
      var viewFragment = insertCKEditor.data.processor.toView(content);
      var modelFragment = insertCKEditor.data.toModel(viewFragment);
      insertCKEditor.model.insertContent(modelFragment, insertPosition);
    }
    // Direct CKEditor 4 support (only body field supported).
    else if (typeof(CKEDITOR) != 'undefined' && CKEDITOR.instances[insertTextarea.id]) {
      editorElement = insertTextarea;
      Backdrop.insert.activateTabPane(editorElement);
      CKEDITOR.instances[insertTextarea.id].insertHtml(content);
    }
    else if (insertTextarea) {
      editorElement = insertTextarea;
      Backdrop.insert.activateTabPane(editorElement);
      Backdrop.insert.insertAtCursor(insertTextarea, content);
    }

    if (editorElement) {
      Backdrop.insert.contentWarning(editorElement, content);
    }

    return false;
  },

  /**
   * Check for vertical tabs and activate the pane containing the editor.
   *
   * @param editor
   *   The DOM object of the editor that will be checked.
   */
  activateTabPane: function(editor) {
    var $pane = $(editor).parents('.vertical-tabs-pane:first');
    var $panes = $pane.parent('.vertical-tabs-panes');
    var $tabs = $panes.parents('.vertical-tabs:first').find('ul.vertical-tabs-list:first li a');
    if ($pane.length && $pane.is(':hidden') && $panes.length && $tabs.length) {
      var index = $panes.children().index($pane);
      $tabs.eq(index).click();
    }
  },

  /**
   * Warn users when attempting to insert an image into an unsupported field.
   *
   * This function is only a 90% use-case, as it doesn't support when the filter
   * tip are hidden, themed, or when only one format is available. However it
   * should fail silently in these situations.
   */
  contentWarning: function(editorElement, content) {
    if (!content.match(/<img /)) return;

    var $wrapper = $(editorElement).parents('div.text-format-wrapper:first');
    if (!$wrapper.length) return;

    $wrapper.find('.filter-guidelines-item:visible li').each(function(index, element) {
      var expression = new RegExp(Backdrop.t('Allowed HTML tags'));
      if (expression.exec(element.textContent) && !element.textContent.match(/<img>/)) {
        alert(Backdrop.t("The selected text format will not allow it to display images. The text format will need to be changed for this image to display properly when saved."));
      }
    });
  },

  /**
   * Insert content into a textarea at the current cursor position.
   *
   * @param editor
   *   The DOM object of the textarea that will receive the text.
   * @param content
   *   The string to be inserted.
   */
  insertAtCursor: function(editor, content) {
    // Record the current scroll position.
    var scroll = editor.scrollTop;

    // IE support.
    if (document.selection) {
      editor.focus();
      sel = document.selection.createRange();
      sel.text = content;
    }

    // Mozilla/Firefox/Netscape 7+ support.
    else if (editor.selectionStart || editor.selectionStart == '0') {
      var startPos = editor.selectionStart;
      var endPos = editor.selectionEnd;
      editor.value = editor.value.substring(0, startPos) + content + editor.value.substring(endPos, editor.value.length);
    }

    // Fallback, just add to the end of the content.
    else {
      editor.value += content;
    }

    // Ensure the textarea does not unexpectedly scroll.
    editor.scrollTop = scroll;
  }
};

})(jQuery);

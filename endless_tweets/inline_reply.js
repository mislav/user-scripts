var actions = find('permalink', '.actions')
if (actions) {
  actions.style.top = document.defaultView.getComputedStyle(actions, null).top
}

var replyLink = find('content', '.actions .repl')
if (replyLink) {
  removeClassName(replyLink, 'repl')
  addClassName(replyLink, 'reply')
} else {
  replyLink = find('content', '.actions .reply')
}
if (replyLink) {
  var replyHandler = function(e) {
    var container = $E('div')
    container.innerHTML = "<form method='post' id='status_update_form' class='status-update-form' action='http://twitter.com/status/update'>\
      <fieldset class='common-form standard-form'>\
        <div class='bar'>\
          <h3><label class='doing' for='status'>What are you doing?</label></h3>\
          <span class='numeric' id='chars_left_notice'>\
            <strong class='char-counter' id='status-field-char-counter'>140</strong>\
          </span>\
        </div>\
        <div class='info'>\
          <textarea name='status' id='status' rows='2' cols='40'></textarea>\
          <div class='status-btn'>\
            <input type='submit' class='status-btn round-btn disabled' id='update-submit' value='reply' name='update'/>\
          </div>\
        </div>\
      </fieldset>\
    </form>"
    
    var username = selectString('meta[@name="page-user-screen_name"]/@content'),
        replyForm = $('permalink').parentNode.appendChild(container.firstChild),
        label = find(replyForm, 'label.doing'),
        textInput = $('status'),
        counter = $('status-field-char-counter'),
        submitButton = $('update-submit'),
        submitDisabled = true,
        updateCounter = function(e) {
          counter.innerHTML = 140 - this.value.length
          if (e && submitDisabled) {
            removeClassName(submitButton, 'disabled')
            submitDisabled = false
          }
        }
        
    label.innerHTML = 'Reply to ' + username + ':'
    textInput.value = '@' + username + ' '
    textInput.focus()
    cursorEnd(textInput)
    updateCounter.call(textInput)
    textInput.addEventListener('keyup', updateCounter, false)
    
    replyForm.addEventListener('submit', function(e) {
      e.preventDefault()
      if (!submitDisabled) {
        addClassName(submitButton, 'disabled')
        submitDisabled = true
        // submit the reply to the server
        twttr.loading()
        loadJSON(replyForm.getAttribute('action'), function(response) {
          twttr.loaded()
          removeChild(replyForm)
          // twitter can return the full HTML for the status
          if (response.status_li) {
            var miniTimeline = $E('ol', { 'class': 'statuses' }, response.status_li)
          } else {
            var miniTimeline = buildUpdateFromJSON(response).parentNode
          }
          insertAfter(miniTimeline, $('permalink'))
          reveal(miniTimeline.firstChild)
        }, {
          method: replyForm.getAttribute('method'),
          data: {
            status: textInput.value,
            in_reply_to_status_id: window.location.toString().match(/\d+/)[0],
            return_rendered_status: true, twttr: true,
            authenticity_token: twttr.form_authenticity_token,
            source: sourceString
          },
          headers: { 'Cookie': getTwitterSession() }
        })
      }
    }, false)
    
    e.preventDefault()
    replyLink.removeEventListener('click', replyHandler, false)
  }
  replyLink.addEventListener('click', replyHandler, false)
}
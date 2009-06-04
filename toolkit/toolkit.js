function $(id){
  return typeof id == 'string' ? document.getElementById(id) : id
}

function down(node) {
  var child = node.firstChild
  while(child && child.nodeType != 1) child = child.nextSibling
  return child
}

function up(node, selector, stopNode) {
  for (; node && (!stopNode || node != stopNode); node = node.parentNode)
    if (matchesCss(node, selector)) return node
}

function matchesCss(node, selector) {
  var firstChar = selector.charAt(0)
  
  if (firstChar == '.') {
    return hasClassName(node, selector.slice(1, selector.length))
  } else if (firstChar == '#') {
    return node.id == selector.slice(1, selector.length)
  } else {
    return node.nodeName.toLowerCase() == selector
  }
}

function hasClassName(element, className) {
  var elementClassName = element.className
  return (elementClassName.length > 0 && (elementClassName == className || 
    new RegExp("(^|\\s)" + className + "(\\s|$)").test(elementClassName)))
}

function addClassName(element, className) {
  if (!hasClassName(element, className))
    element.className += (element.className ? ' ' : '') + className
  return element
}

function removeClassName(element, className) {
  element.className = element.className.replace(
    new RegExp("(^|\\s+)" + className + "(\\s+|$)"), ' ')
  return element
}

function removeChild(element) {
  return element.parentNode.removeChild(element)
}

function insertAfter(element, node) {
  return node.parentNode.insertBefore(element, node.nextSibling)
}

function insertTop(element, node) {
  return node.insertBefore(element, node.firstChild)
}

function $E(name, attributes, content) {
  if (typeof attributes == 'string') {
    content = attributes
    attributes = null
  }
  var node = document.createElement(name)
  if (attributes) for (var attr in attributes) node.setAttribute(attr, attributes[attr])
  if (content) node.innerHTML = content
  return node
}

function forEach(object, block, context) {
  var xpath = typeof object.snapshotItem == "function"
  for (var i = 0, length = xpath ? object.snapshotLength : object.length; i < length; i++)
    block.call(context, xpath ? object.snapshotItem(i) : object[i], i, object)
}

function xpath2array(result) {
  var item, arr = []
  for (var i = 0, length = result.snapshotLength; i < length; i++)
    arr.push(result.snapshotItem(i))
  return arr
}

function select(xpath, parent, type) {
  if (!/^\.?\/./.test(xpath)) xpath = css2xpath(xpath)
  return document.evaluate(xpath, parent || document, null, type || XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
}
function selectString(xpath, parent) {
  var result = select(xpath, parent, XPathResult.STRING_TYPE)
  return result && result.stringValue
}

function find(parent, xpath, index) {
  parent = $(parent)
  if (index == undefined)
    return select(xpath, parent, XPathResult.FIRST_ORDERED_NODE_TYPE).singleNodeValue
  else
    return select(xpath, parent).snapshotItem(index)
}

function xpathClass(name) {
  return "[contains(concat(' ', @class, ' '), ' " + name + " ')]"
}

// only handles child selectors, classnames and IDs
function css2xpath(css) {
  var fragments = css.split(/\s+/), xpath = ['.'], child = false

  xpath.add = function(part) {
    xpath.push(child ? '/' : '//')
    child = false
    xpath.push(part || '*')
  }
  
  fragments.forEach(function(fragment) {
    if (!fragment) return;
    if (fragment == '>') child = true;
    else if (/^([^.]*)\.([\w.-]+)/.test(fragment)) {
      xpath.add(RegExp.$1)
      RegExp.$2.split('.').forEach(function(className) {
        xpath.push(xpathClass(className))
      })
      if (RegExp["$'"]) xpath.push(RegExp["$'"])
    }
    else if (/^([^.]*)#([\w-]+)/.test(fragment)) {
      xpath.add(RegExp.$1)
      xpath.push('[@id="' + RegExp.$2 + '"]')
      if (RegExp["$'"]) xpath.push(RegExp["$'"])
    }
    else xpath.add(fragment)
  })
  return xpath.join('')
}

function getStyle(element, style) {
  element = $(element)
  if (style == 'float') style = 'cssFloat'
  var value = element.style[style]
  if (!value) {
    var css = document.defaultView.getComputedStyle(element, null)
    value = css ? css[style] : null
  }
  if (style == 'opacity') return value ? parseFloat(value) : 1.0
  return value == 'auto' ? null : value
}

function ajax(params) {
  var defaults = {
    method: 'GET',
    onerror: function(response) { log('ERROR ' + response.status) }
  }
  var defaultHeaders = {
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': 'application/json, text/javascript, text/html, */*'
  }
      
  params = extend(defaults, params)
  params.headers = extend(defaultHeaders, params.headers || {})
  
  if (!/^https?[:]/.test(params.url)) {
    params.url = window.location.protocol + '//' + window.location.host + params.url
  }
  
  if (typeof params.data == 'object') {
    params.data = objectToQueryString(params.data)
    params.headers['Content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
  }
  
  return xhr(params)
}

function loadJSON(url, onload, params) {
  params = extend({ url: url, onload: onload }, params || {})
  var handler = params.onload
  
  params.onload = function(response) {
    if (typeof response.getResponseHeader == 'function') {
      // native XMLHttpRequest interface
      var responseType = (response.getResponseHeader('Content-type') || '').split(';')[0]
    } else {
      // GM_xmlhttpRequest interface
      var responseType = (response.responseHeaders.match(/^Content-[Tt]ype:\s*([^\s;]+)/m) || [])[1]
    }
    if (responseType == 'application/json' || responseType == 'text/javascript') {
      var object = eval("(" + response.responseText + ")")
      if (object) handler(object, response)
    }
  }
  return ajax(params)
}

function strip(string) {
  return string.replace(/^\s+/, '').replace(/\s+$/, '')
}

function objectToQueryString(hash) {
  var pairs = []
  for (key in hash) {
    var value = hash[key]
    if (typeof value != 'undefined') pairs.push(encodeURIComponent(key) + '=' +
      encodeURIComponent(value == null ? '' : String(value)))
  }
  return pairs.join('&')
}

function countOccurences(string, pattern) {
  return string.split(pattern).length - 1
}

var bracketMap = { ']': '[', ')': '(', '}': '{' }

function linkify(text, external) {
  return text.replace(/\b(https?:\/\/|www\.)[^\s]+/g, function(href) {
    // check for punctuation character at the end
    var punct = '', match = href.match(/[.,;:!?\[\](){}"']$/)
    if (match) {
      var punct = match[0], opening = bracketMap[punct]
      // ignore closing bracket if it should be part of the URL (think Wikipedia links)
      if (opening && countOccurences(href, opening) == countOccurences(href, punct)) punct = ''
      // in other cases, last punctuation character should not be a part of the URL
      else href = href.slice(0, -1)
    }
    
    var fullHref = (href.indexOf('http') == 0) ? href : 'http://' + href
    return '<a href="' + fullHref + '"' + (external ? ' target="_blank"' : '') + '>' + href + '</a>' + punct
  })
}

function extend(destination, source) {
  for (var property in source) destination[property] = source[property]
  return destination
}

function cursorEnd(field) {
  positionCursor(field, field.value.length)
}

function positionCursor(field, start, end) {
  if (start < 0) start = field.value.length + start
  if (!end) end = start
  field.selectionStart = start
  field.selectionEnd = end
}

function URL(string) {
  var match = string.match(/(?:(https?):\/\/([^\/]+))?([^?]*)(?:\?(.*))?/)
  string = match[0]
  this.domain = match[2]
  this.path = match[3]
  this.query = match[4]
  
  this.toString = function() {
    return string
  }
}

URL.prototype.pathWithQuery = function() {
  return this.path + (this.query ? '?' + this.query : '')
}
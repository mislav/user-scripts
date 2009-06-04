var Time = (function() {
  var sec = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 }
  
  return {
    agoInWords: function(time, relativeTo) {
      if (!relativeTo) relativeTo = new Date()
      var delta = (relativeTo - time) / 1000
      if (delta < 5) return 'less than 5 seconds'
      else if (delta < 10) return 'less than 10 seconds'
      else if (delta < 20) return 'less than 20 seconds'
      else if (delta < sec.m) return 'less than a minute'
      else if (delta < sec.m * 2) return 'about a minute'
      else if (delta < sec.h) return Math.round(delta / 60) + ' minutes'
      else if (delta < sec.h * 2) return 'about an hour'
      else if (delta < sec.d) return 'about ' + Math.round(delta / 3600) + ' hours'
      else if (delta < sec.d * 2) return '1 day'
      else return Math.round(delta / sec.d) + ' days'
    },
    agoToDate: function(string, relativeTo) {
      if (!relativeTo) relativeTo = new Date()
      var match = string.match(/(?:(?:about|less than) )?(a|an|\d+) ([smhd])/)
      if (match) {
        var amount = Number(match[1]) || 1, metric = match[2]
        return new Date(relativeTo - sec[metric] * amount * 1000)
      }
    }
  }
})()

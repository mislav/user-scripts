#!/usr/bin/env ruby
require 'net/http'
require 'curl'
require 'cgi'
require 'haml'
require 'sass'
require 'stringio'

class Gm < Thor
  desc 'build', %(Builds the *.user.js files from *.js sources)
  def build
    for name in self.class.scripts.keys
      source = File.open("#{name}/#{name}.js", 'r')
      target = File.open("#{name}/#{name}.user.js", 'w')
      
      begin
        render_template(source, target)
      ensure
        source.close
        target.close
      end
      
      puts target.path
    end
  end
  
  desc 'check', %(Checks scriptSize property on both local and remote file)
  def check
    Net::HTTP.start('userscripts.org') do |http|
      for name, id in self.class.scripts
        req = Net::HTTP::Head.new script_path(id)
        res = http.request(req)
        remote_size = res.content_length
        
        file = script_file(name)
        local_size = File.stat(file).size
        
        hardcoded_size = nil
        
        File.open(file) do |script|
          script.each do |line|
            if line =~ /\bscriptSize: (\d+)\b/
              hardcoded_size = $1.to_i
            end
          end
        end
        
        puts "#{name} -- remote: #{remote_size}, local: #{local_size}, hardcoded: #{hardcoded_size}"
      end
    end
  end
  
  def upload(name)
    id = self.class.scripts[name]
    raise ArgumentError, "cannot find script '#{name}'" unless id
    
    print 'UserScripts.org login ("email:pass"): '
    STDIN.gets
    auth = $_.chomp.split(':')
    encoded_auth = auth.map { |i| CGI::escape i }
    
    # FIXME: this is no work! (prolly because of CSRF protection)
    c = Curl::Easy.new("http://#{encoded_auth.join(':')}@userscripts.org/scripts/update_src/#{id}")
    c.multipart_form_post = true
    c.http_post(
      Curl::PostField.content('which_source', 'file'),
      Curl::PostField.file('file[src]', script_file(name))
    )
  end
  
  def self.scripts
    @@scripts ||= {
      'endless_tweets' => 24398
    }
  end
  
  private
  
  def script_path(id)
    "/scripts/source/#{id}.user.js"
  end
  
  def script_file(name)
    "#{name}/#{name}.user.js"
  end
  
  def normalize_partial_path(path, dir)
    if path.index('/')
      path
    else
      "#{dir}/#{path}"
    end
  end
  
  def render_template(file, target = nil)
    partial = case file.extension
    when 'sass'
      css = Sass::Engine.new(file.read, :style => :compact).to_css
      %[addCSS(#{javascript_string(css)})\n]
    when 'haml'
      html = Haml::Engine.new(file.read).to_html
      javascript_string(html.rstrip)
    when 'js'
      target ||= StringIO.new
      render_js_with_partials(file, target)
      target.string if StringIO === target
    else
      raise "don't know how to handle .#{file.extension}"
    end
  end
  
  def render_js_with_partials(source, target)
    dir = File.dirname(source.path)
    
    for line in source
      case line
      when %r{^(\s*)(.*)//= ([\w/.]+)}
        indentation, code, partial_name = $1, $2, $3
        partial = normalize_partial_path(partial_name, dir)
        target << indentation
        target << code
        
        if File.exists?(partial)
          partial_file = File.open(partial, 'r')
          begin
            rendered_partial = render_template(partial_file)
          ensure
            partial_file.close
          end
          
          if code.empty?
            target.puts "/*** #{partial} ***/"
            target << indentation
          end
          
          unless indentation.empty?
            rendered_partial.gsub!(/\n([^\n])/, "\n#{indentation}\\1")
          end
          
          target.puts rendered_partial
        else
          if code.empty?
            target.puts "/*** NOT FOUND: #{partial} ***/"
          else
            target.puts "null // NOT FOUND: #{partial}"
          end
        end
      else
        target << line
      end
    end
  end
  
  def javascript_string(string)
    string = string.gsub('\\', '\\\\').gsub(/\n+/, "\\\n").gsub('"', '\"')
    %["#{string}"]
  end
end

File.class_eval do
  def extension
    @extension ||= path && path =~ /\.(\w{2,5})$/ && $1
  end
end
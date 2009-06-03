#!/usr/bin/env ruby
require 'net/http'
require 'curl'
require 'cgi'
require 'sass'

class Gm < Thor
  desc 'build', %(Builds the *.user.js files from *.js sources)
  def build
    for name in self.class.scripts.keys
      source = File.open("#{name}/#{name}.js", 'r')
      target = File.open("#{name}/#{name}.user.js", 'w')
      
      for line in source
        case line
        when %r{(\s*)//= ([\w/.]+)}
          indentation, partial_name = $1, $2
          partial = normalize_partial_path(partial_name, name)
          target.puts "/*** #{partial} ***/"
          target.write read_partial(partial, indentation)
        else
          target.write line
        end
      end
      
      source.close
      target.close
      puts target.path
    end
  end
  
  desc 'check', %(Checks scriptLength property on both local and remote file)
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
            if line =~ /\bscriptLength = (\d+)\b/
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
  
  def normalize_partial_path(path, script_name)
    if path.index('/')
      path
    else
      "#{script_name}/#{path}"
    end
  end
  
  def read_partial(path, indentation = nil)
    source = File.read(path)
    extension = path =~ /\.(\w{2,5})$/ && $1
    
    case extension
    when 'sass'
      css = Sass::Engine.new(source, :style => :compact).to_css
      %[addCSS("#{css.gsub(/\n+/, "\\\n").gsub('"', '\"')}")\n]
    else
      source
    end
  end
end
#!/usr/bin/env ruby
require 'net/http'
require 'curl'
require 'cgi'

class Gm < Thor
  desc 'check', %(Checks scriptLength property on both local and remote file)
  def check
    Net::HTTP.start('userscripts.org') do |http|
      self.class.scripts.each do |name, id|
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
  
  def script_path(id)
    "/scripts/source/#{id}.user.js"
  end
  
  def script_file(name)
    "#{name}/#{name}.user.js"
  end
  
  def self.scripts
    @@scripts ||= {
      'endless_tweets' => 24398
    }
  end
end
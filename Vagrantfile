# -*- mode: ruby -*-
# vi: set ft=ruby :

# Vagrantfile API/syntax version. Don't touch unless you know what you're doing!
VAGRANTFILE_API_VERSION = "2"

Vagrant.configure(VAGRANTFILE_API_VERSION) do |config|
  config.vm.box = "phusion/ubuntu-14.04-amd64"

  config.vm.provision :shell, inline: $script, privileged: false, keep_color: true

  # Web frontend
  config.vm.network :private_network, ip: "14.14.14.14"

  config.vm.network "private_network", type: "dhcp"

  config.vm.synced_folder ".", "/vagrant", type: "nfs"

  config.vm.provider "virtualbox" do |v|
    v.name = "betterlounge"
    v.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
    v.customize ["modifyvm", :id, "--natdnsproxy1", "on"]
    v.customize ["setextradata", :id, "vboxinternal2/sharedfoldersenablesymlinkscreate/v-root", "1"]
  end

end

$script = <<SCRIPT

sudo apt-get update -q

sudo apt-get install -y software-properties-common python build-essential git ruby g++ zlib1g-dev

sudo debconf-set-selections <<< 'mysql-server mysql-server/root_password password betterlounge'
sudo debconf-set-selections <<< 'mysql-server mysql-server/root_password_again password betterlounge'
sudo apt-get -y install mysql-server-5.5

sudo apt-get install -y redis-server subversion

wget https://nodejs.org/download/release/v4.2.4/node-v4.2.4-linux-x64.tar.xz
tar xf node-v4.2.4-linux-x64.tar.xz
cd node-v4.2.4-linux-x64
sudo cp bin/* /usr/bin
sudo ln -sf /home/vagrant/node-v4.2.4-linux-x64/lib/node_modules/npm/bin/npm-cli.js /usr/bin/npm
sudo npm install -g npm@3.8.3

sudo chown -R vagrant:vagrant /home/vagrant/.npm
sudo npm install pm2 -g --unsafe-perm

pushd /vagrant
  npm install --no-bin-links
  sudo mkdir log
  sudo chmod 0777 log
  mysql -uroot -pbetterlounge -e 'CREATE DATABASE betterlounge;'
  mysql -uroot -pbetterlounge betterlounge < /vagrant/schema.sql
popd

SCRIPT

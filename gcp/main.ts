import { Construct } from 'constructs';
import * as cdktf from 'cdktf';
import * as path from 'path';
import * as fs from 'fs';
import * as gcp from '@cdktf/provider-google';

class eksdStack extends cdktf.TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);
    const credentialsPath = path.join(process.cwd(), 'google.json')
    const credentials = fs.existsSync(credentialsPath) ? fs.readFileSync(credentialsPath).toString() : '{}'
    const local = 'asia-east1'; //region
    const projectId = 'phrasal-concord-274901';
    new gcp.GoogleProvider(this, 'GoogleAuth', {
      region: local,
      zone: local+'-c',
      project: projectId,
      credentials
    });
    const network = new gcp.ComputeNetwork(this, 'Network', {
      name: 'cdktf-network'
    })
    new gcp.ComputeFirewall(this, 'fw', {
      name: 'cdktf-network-fw',
      network: network.name,
      allow: [{
        protocol: 'tcp',
        ports: ['22'],
      }],
      sourceTags: ['cdktf-network'],
    });
    new gcp.ComputeInstance(this, 'ComputeInstance', {
      machineType: 'e2-medium',
      name: 'eksd',
      tags: ['cdktf-network'],
      bootDisk: [{
        initializeParams: [{image: 'ubuntu-os-cloud/ubuntu-2010'}],
      }],
      networkInterface: [{
        network: network.name,
        accessConfig: [{}],
      }],
      dependsOn: [network],
      canIpForward: true,
      metadataStartupScript: `
      set -xe
      set -o pipefail
      
      sleep 30
      
      curl -sfL https://get.rke2.io | INSTALL_RKE2_VERSION=v1.18.12-beta1+rke2r2 sh -
      
      sleep 10 
      
      sudo apt-get update -y
      
      sudo apt-get install python3-venv python3-wheel python3-pip jq -y
      
      cd ~/
      
      python3 -m venv ~/python3
      
      . ~/python3/bin/activate
      
      git clone https://github.com/rancher/rke2.git
      
      cd rke2/contrib/custom-image-kubelet
      
      pip install -r requirements.txt
      
      
      sleep 10
      
      ~/python3/bin/python genconfig.py --release-url https://distro.eks.amazonaws.com/kubernetes-1-18/kubernetes-1-18-eks-1.yaml
      
      systemctl enable rke2-server
      
      systemctl start rke2-server
      
      
      # start to install kubectl 
      echo "start to install kubectl" 
      apt-get update -y && apt-get install  apt-transport-https gnupg2 curl -y
      curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key add -
      echo "deb https://apt.kubernetes.io/ kubernetes-xenial main" | sudo tee -a /etc/apt/sources.list.d/kubernetes.list
      sudo apt-get update -y
      sudo apt-get install kubectl -y
      
      echo 'export KUBECONFIG=/etc/rancher/rke2/rke2.yaml' >> /etc/bash.bashrc
      echo 'export PATH=$PATH:/var/lib/rancher/rke2/bin' >> /etc/bash.bashrc
      kubectl completion bash >/etc/bash_completion.d/kubectl
      sleep 10
      echo 'alias k=kubectl' >> /etc/bash.bashrc
      echo 'complete -F __start_kubectl k' >> /etc/bash.bashrc
      echo 'source <(kubectl completion bash)' >> /etc/bash.bashrc
      `
    });
    // new cdktf.TerraformOutput(this, 'ip', {
    //   value: `${vm.[0].accessConfig![0].natIp}`,
    // });
  }
}

const app = new cdktf.App();
new eksdStack(app, 'gcp');
app.synth();

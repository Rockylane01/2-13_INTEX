#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh
sudo certbot -n -d intex-ella-rises-env.eba-6bnj5m2y.us-east-2.elasticbeanstalk.com -d ellarises2-13.is404.net --nginx --agree-tos --email oliviagspringer@gmail.com

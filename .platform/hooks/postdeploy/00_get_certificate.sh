#!/usr/bin/env bash
# .platform/hooks/postdeploy/00_get_certificate.sh

echo "Starting SSL certificate setup..."

# Wait for nginx to be fully ready
sleep 30

# Test if both domains are accessible
echo "Testing domain accessibility..."
curl -f -s http://intex-ella-rises-env.eba-6bnj5m2y.us-east-2.elasticbeanstalk.com > /dev/null
EB_STATUS=$?

curl -f -s http://ellarises2-13.is404.net > /dev/null
CNAME_STATUS=$?

if [ $EB_STATUS -eq 0 ] && [ $CNAME_STATUS -eq 0 ]; then
    echo "Both domains are accessible, requesting multi-domain certificate..."
    sudo certbot -n -d intex-ella-rises-env.eba-6bnj5m2y.us-east-2.elasticbeanstalk.com -d ellarises2-13.is404.net --nginx --agree-tos --email oliviagspringer@gmail.com
    if [ $? -eq 0 ]; then
        echo "Multi-domain certificate installed successfully!"
    else
        echo "Multi-domain certificate failed, trying single domain..."
        sudo certbot -n -d intex-ella-rises-env.eba-6bnj5m2y.us-east-2.elasticbeanstalk.com --nginx --agree-tos --email oliviagspringer@gmail.com
    fi
else
    echo "One or both domains not accessible yet. EB status: $EB_STATUS, CNAME status: $CNAME_STATUS"
    echo "Trying single domain certificate for EB environment only..."
    sudo certbot -n -d intex-ella-rises-env.eba-6bnj5m2y.us-east-2.elasticbeanstalk.com --nginx --agree-tos --email oliviagspringer@gmail.com
fi

echo "SSL setup complete."

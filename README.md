# Caramel
The looking glass backend for [Smokey](https://github.com/kittensaredabest/smokey)

## Installation

### Dependencies
* docker
* docker-compose
* a reverse proxy (nginx, caddy)

### Download Files
copy the docker-compose.example.yml and rename it to docker-compose.yml and place in a new directory of your choice on the host machine that you are hosting Caramel on

### Configure docker-compose.yml
configure the following environment variables in the docker-compose.yml file

CORS_ORIGIN: the domain that you are hosting your looking glass on (ex: https://lg.example.com)

BGP_ENABLED: true/false if you want to have bgp route trace in your looking glass (using bird2 which you install and configure on the host system, ideally sending a full table to it from your router / route collector)

PINGTRACE_ENABLED: true/false if you want to have ping/traceroute/mtr in your looking glass (you would only really disable this if you wanted your looking glass only for bgp route trace)



### Docker
If you are not using bird then edit docker-compose.yml and remove the sections where bird is refrenced

Pull the docker container
```
docker compose pull
```

Start the docker container
```
docker compose up -d
```
The service will now lisen on port 8080


### Reverse Proxy

#### Nginx
```
server {
    listen 80;
    listen [::]:80;
    server_name lg-api.nyc.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen [::]:443 ssl;
    listen 443 ssl;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log warn;

    ssl_certificate /etc/letsencrypt/live/lg-api.nyc.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/lg-api.nyc.example.com/privkey.pem;

    server_name lg-api.nyc.example.com;

    location / {
        include proxy_params;
        proxy_pass http://127.0.0.1:8080;
    }
}
```

#### Caddy
```
lg-api.nyc.example.com {
    reverse_proxy localhost:8080
}
```
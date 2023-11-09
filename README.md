# Caramel
The looking glass backend for [Smokey](https://github.com/kittensaredabest/smokey)

## Installation

### Dependencies
- docker
- docker-compose
- a reverse proxy (nginx, caddy)

### Download Files
Copy the `docker-compose.example.yml` and rename it to `docker-compose.yml`. Place it in a new directory of your choice on the host machine where you are hosting Caramel.

### Configure `docker-compose.yml`
Configure the following environment variables in the `docker-compose.yml` file:

- `CORS_ORIGIN`: the domain where you are hosting your looking glass (e.g., https://lg.example.com)
- `BGP_ENABLED`: `true` or `false`. Enable this if you want to have BGP route trace in your looking glass. You need to install and configure `bird2` on the host system and ideally send a full table to it from your router/route collector.
- `PINGTRACE_ENABLED`: `true` or `false`. Enable this if you want to have ping/traceroute/mtr in your looking glass. Disable it if you only want your looking glass for BGP route trace.

### Docker
If you are not using bird, edit `docker-compose.yml` and remove the sections where bird is referenced.

Pull the docker container:
```bash
docker compose pull
```

Start the docker container:
```bash
docker compose up -d
```
The service will now listen on port 8080 on the host machine.

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

    location /files/ {
        root /var/www/lg/;
    }
    location / {
        include proxy_params;
        proxy_pass http://127.0.0.1:8080;
    }
}
```

#### Caddy
```
lg-api.nyc.example.com {
    handle_path /files/* {
        file_server
        root * /var/www/lg/files
    }
    reverse_proxy localhost:8080
}
```

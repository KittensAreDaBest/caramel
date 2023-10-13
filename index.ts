import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { spawnSync } from 'child_process';
import cors from '@fastify/cors';
import { z } from 'zod';
import { isIP } from 'net';
import isValidDomain from 'is-valid-domain';

const server = fastify();

// Check if CORS origin is set
if (!process.env.CORS_ORIGIN) {
    console.error("CORS origin is required for security purposes. Please set it in your docker-compose.yml file.");
    process.exit(1);
}

// CORS origin configuration
server.register(cors, {
    origin: process.env.CORS_ORIGIN
});

// Rate limiting (30r/m)
server.register(import('@fastify/rate-limit'), {
    max: 30,
    timeWindow: '1 minute'
});

// Utility functions
const validateSubnet = (subnet: string): boolean => {
    const [ip, cidrStr] = subnet.split('/');
    const ipVersion = isIP(ip);
    const cidr = Number(cidrStr);

    // Check if the provided values are possible
    if (isNaN(cidr) || ipVersion === 0 || cidrStr === undefined) {
        return false;
    }

    // Make sure the provided subnet is actually valid
    return (ipVersion === 4 && cidr >= 0 && cidr <= 32) || (ipVersion === 6 && cidr >= 0 && cidr <= 128);
};

const isValidTarget = (type: string, target: string): boolean => {
    if (type === 'bgp') {
        return isIP(target) || validateSubnet(target);
    }
    return isIP(target) || isValidDomain(target);
};

// Server routes
server.get('/', (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(200).send({ message: 'https://github.com/KittensAreDaBest/caramel' });
});

server.post('/lg', (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const validation = z.object({
            type: z.enum(['mtr', 'traceroute', 'ping', 'bgp']),
            target: z.string().trim(),
        }).parse(request.body);

        if (!isValidTarget(validation.type, validation.target)) {
            return reply.status(400).send({ error: 'Invalid target' });
        }

        const remoteIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
        console.log(`[${new Date()}][LG] ${validation.type} ${validation.target} from ${remoteIp}`);

        switch (validation.type) {
            case 'mtr':
                if (!(process.env.PINGTRACE_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'MTR is disabled' });
                }
                const mtr = spawnSync('mtr', ['-c', '5', '-r', '-w', '-b', validation.target]);
                return reply.status(200).send({ data: mtr.stdout.toString().length > 0 ? mtr.stdout.toString() : mtr.stderr.toString() });

            case 'traceroute':
                if (!(process.env.PINGTRACE_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'Traceroute is disabled' });
                }
                const traceroute = spawnSync('traceroute', ['-w', '1', '-q', '1', validation.target]);
                return reply.status(200).send({ data: traceroute.stdout.toString().length > 0 ? traceroute.stdout.toString() : traceroute.stderr.toString() });

            case 'ping':
                if (!(process.env.PINGTRACE_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'Ping is disabled' });
                }
                const ping = spawnSync('ping', ['-c', '5', validation.target]);
                return reply.status(200).send({ data: ping.stdout.toString().length > 0 ? ping.stdout.toString() : ping.stderr.toString() });

            case 'bgp':
                if (!(process.env.BGP_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'BGP is disabled' });
                }
                const bgp = spawnSync('birdc', ['-r', 'sh', 'ro', 'all', 'for', validation.target]);
                return reply.status(200).send({ data: bgp.stdout.toString().length > 0 ? bgp.stdout.toString() : bgp.stderr.toString() });

            default:
                return reply.status(422).send({ error: 'Invalid type' });
        }
    } catch (err) {
        reply.status(400).send({ error: 'Invalid request' });
    }
});

server.listen({ port: 8080, host: '0.0.0.0' }, (err: any, address: string) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});
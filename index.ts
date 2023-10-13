import fastify, { FastifyReply, FastifyRequest } from 'fastify';
import { spawn } from 'child_process';
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
        return isIP(target) !== 0 || validateSubnet(target);
    }
    return isIP(target) !== 0 || isValidDomain(target);
};

const formatDate = () => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); // January is 0!
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
    return `${day}.${month}.${year} ${hours}:${minutes} (${timeZone})`;
};

// Execute command asynchronously
const executeCommand = (command: string, args: string[]): Promise<string> => {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let output = '';

        child.stdout.on('data', (data) => {
            output += data;
        });

        child.stderr.on('data', (data) => {
            output += data;
        });

        child.on('close', (code: number) => {
            // If application exits with code higher than 1, then throw an error and log it in console.
            // The reason why it's above 1, is because ping exits with code 1, if it's unable to get an ICMP reply.
            if (code > 1) {
                console.log(`Command failed with code ${code}: ${output}`);
                return reject(new Error(`Command failed with code ${code}: ${output}`));
            }
            resolve(output);
        });
    });
};

// Server routes
server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.status(200).send({ message: 'https://github.com/KittensAreDaBest/caramel' });
});

server.post('/lg', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const validation = z.object({
            type: z.enum(['mtr', 'traceroute', 'ping', 'bgp']),
            target: z.string().trim(),
        }).parse(request.body);

        if (!isValidTarget(validation.type, validation.target)) {
            return reply.status(400).send({ error: 'Invalid target' });
        }

        const remoteIp = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
        console.log(`${formatDate()} - ${validation.type} ${validation.target} from ${remoteIp}`);

        let output;
        switch (validation.type) {
            case 'mtr':
                if (!(process.env.PINGTRACE_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'MTR is disabled' });
                }
                output = await executeCommand('mtr', ['-c', '5', '-r', '-w', '-b', validation.target]);
                break;

            case 'traceroute':
                if (!(process.env.PINGTRACE_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'Traceroute is disabled' });
                }
                output = await executeCommand('traceroute', ['-w', '1', '-q', '1', validation.target]);
                break;

            case 'ping':
                if (!(process.env.PINGTRACE_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'Ping is disabled' });
                }
                output = await executeCommand('ping', ['-c', '5', validation.target]);
                break;

            case 'bgp':
                if (!(process.env.BGP_ENABLED === 'true')) {
                    return reply.status(403).send({ error: 'BGP is disabled' });
                }
                output = await executeCommand('birdc', ['-r', 'sh', 'ro', 'all', 'for', validation.target]);
                break;

            default:
                return reply.status(422).send({ error: 'Invalid type' });
        }

        reply.status(200).send({ data: output });
    } catch (err) {
        reply.status(400).send({ error: 'Something went wrong while processing the request' });
    }
});

server.listen({ port: 8080, host: '0.0.0.0' }, (err: any, address: string) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`Server listening at ${address}`);
});
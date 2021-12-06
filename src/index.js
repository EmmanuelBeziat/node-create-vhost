#! /usr/bin/env node

import fs from 'fs-extra'
import { exec } from 'child_process'
import { Command } from 'commander/esm.mjs'

const program = new Command()
program
	.requiredOption('--name <name>', 'The name of the website (Usually, the domain without extension)')
	.requiredOption('--domain <domain>', 'The domain of the website')
	.option('--subdomain <subdomain>', 'The subdomain of the website', 'www')
	.option('--subfolder <subfolder>', 'The subfolder of the website', 'site')
	.option('--root <root>', 'The root directory of the website', '/var/www/')
	.option('--port <port>', 'The port of the website', 80)
	.option('--hook <passphrase>', 'Create a webhook to use with github')
	.option('--ssl', 'Use certbot for creating SSL certificates')
	.parse()

const options = program.opts()

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	dim: "\x1b[2m",
	underscore: "\x1b[4m",
	blink: "\x1b[5m",
	reverse: "\x1b[7m",
	hidden: "\x1b[8m",

	fg: {
		black: "\x1b[30m",
		red: "\x1b[31m",
		green: "\x1b[32m",
		yellow: "\x1b[33m",
		blue: "\x1b[34m",
		magenta: "\x1b[35m",
		cyan: "\x1b[36m",
		white: "\x1b[37m",
		crimson: "\x1b[38m"
	},
	bg: {
		black: "\x1b[40m",
		red: "\x1b[41m",
		green: "\x1b[42m",
		yellow: "\x1b[43m",
		blue: "\x1b[44m",
		magenta: "\x1b[45m",
		cyan: "\x1b[46m",
		white: "\x1b[47m",
		crimson: "\x1b[48m"
	}
}

const createFolder = async path => !fs.existsSync(path) && fs.mkdirSync(path, { recursive: true })

/**
 * Apache Vhost
 */
const apacheVhost = () => {
	const content = `# ${options.subfolder}
<VirtualHost *:${options.port}>
	# Server
	ServerName ${options.subdomain}.${options.domain}
	ServerAlias ${options.subdomain}.${options.domain}
	ServerAdmin contact@${options.domain}

	DocumentRoot ${options.rootPath}

	# Logs
	ErrorLog \${APACHE_LOG_DIR}/${options.name}/${options.subfolder}_error.log
	CustomLog \${APACHE_LOG_DIR}/${options.name}/${options.subfolder}_access.log combined
</VirtualHost>

`

	fs.outputFile(`./outputs/apache2/${options.name}.conf`, content, { flag: 'a+' })
		.then(() => console.log(colors.fg.green, `${options.name} ${options.subdomain} → ✔️ Apache Vhost created`, colors.reset))
		.catch(err => console.error(colors.fg.red, `${options.name} ${options.subdomain} → ❌ ${err}`, colors.reset))
}

/**
 * Nginx Vhost
 */
const nginxVhost = () => {
	const content = `# ${options.subfolder}
server {
	listen ${options.ssl ? '443 ssl http2' : '80'};};
	server_name ${options.subdomain}.${options.domain};

	include snippets/favicon_error.conf;

	location ~* ^.+.(jpg|jpeg|gif|css|png|js|ico|txt|srt|swf|woff|woff2)$ {
		root ${options.rootPath}/;
		expires 30d;
	}

	location / {
		proxy_pass http://127.0.0.1:${options.port}/;
		include /etc/nginx/conf.d/proxy.conf;
		root ${options.rootPath}/;
	}

	access_log /var/log/nginx/${options.name}/${options.subfolder}_access.log;
	error_log /var/log/nginx/${options.name}/${options.subfolder}_error.log info;

	${options.ssl ? 'ssl_certificate /etc/letsencrypt/live/' + options.domain + '/fullchain.pem;' : '#'}
	${options.ssl ? 'ssl_certificate_key /etc/letsencrypt/live/' + options.domain + '/privkey.pem;' : '#'}
	${options.ssl ? 'include snippets/ssl.conf;' : '#'}
	${options.ssl ? 'ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;' : '#'}
}

`
	fs.outputFile(`./outputs/nginx/${options.name}.conf`, content, { flag: 'a+' })
		.then(() => console.log(colors.fg.green, `${options.name} ${options.subdomain} → ✔️ Nginx Vhost created`, colors.reset))
		.catch(err => console.error(colors.fg.red, `${options.name} ${options.subdomain} → ❌ ${err}`, colors.reset))
}

/**
 * Logs
 */
const logs = () => {
	createFolder(`./outputs/logs/apache2/${options.name}/`)
	createFolder(`./outputs/logs/nginx/${options.name}/`)
}

/**
 * Hooks
 */
const hook = () => {
	if (!options.hook) return
	const hookFilePath = './outputs/hooks/hooks.json'

	if (!fs.existsSync(hookFilePath)) {
		console.log('bite')
		fs.outputFileSync(hookFilePath, '[]')
	}
	const file = fs.readFileSync(hookFilePath)

	const hooks = JSON.parse(file)

	const content = {
    id: `deploy-${options.name}`,
    "execute-command": `/usr/share/hooks/${options.name}-${options.subfolder}/deploy.sh`,
    "command-working-directory": `/var/www/${options.name}/${options.subfolder}/`,
    "pass-arguments-to-command":
    [
      {
        "source": "payload",
        "name": "head_commit.id"
      },
      {
        "source": "payload",
        "name": `${options.name}`
      },
      {
        "source": "payload",
        "name":  `social@${options.domain}`
      }
    ],
    "response-message": "Déploiement…",
    "trigger-rule":
    {
      "and":
      [
        {
          "match":
          {
            "type": "payload-hash-sha1",
            "secret": `${options.hook}`,
            "parameter":
            {
              "source": "header",
              "name": "X-Hub-Signature"
            }
          }
        },
        {
          "match":
          {
            "type": "value",
            "value": "refs/heads/main",
            "parameter":
            {
              "source": "payload",
              "name": "ref"
            }
          }
        }
      ]
    }
  }

	hooks.push(content)
	fs.outputFile(hookFilePath, JSON.stringify(hooks, null, 2))

	console.log(colors.fg.green, `${options.name} ${options.subdomain} → ✔️ Hooks added`, colors.reset)

const scriptContent = `#!/bin/bash

exec > /usr/share/hooks/${options.name}-${options.subfolder}/output.log 2>&1

git fetch --all
git checkout --force "origin/main"
`

	fs.outputFile(`./outputs/hooks/${options.name}-${options.subfolder}/deploy.sh`, scriptContent)
	console.log(colors.fg.green, `${options.name} ${options.subdomain} → ✔️ Hooks deploy script created`, colors.reset)

	exec(`chmod +x ./outputs/hooks/${options.name}-${options.subfolder}/deploy.sh`, (err, stdout, stderr) => {
		if (err) {
			console.error(colors.fg.red, `${err}`, colors.reset)
			return
		}

		if (stderr) {
			console.error(colors.fg.red, `${stderr}`, colors.reset)
			return
		}

		console.log(colors.fg.green, `${options.name} ${options.subdomain} → ✔️ Hooks deploy script ready (${stdout})`, colors.reset)
	})
}

/**
 * Certbot
 */
const certbot = () => {
	if (!options.ssl) return

	exec('ls', (error, stdout, stderr) => {
		if (error) {
			console.error(colors.fg.red, `${options.name} ${options.subdomain} → ❌ ${error}`, colors.reset)
			return
		}

		if (stderr) {
			console.error(colors.fg.red, `${options.name} ${options.subdomain} → ❌ ${stderr}`, colors.reset)
			return
		}

		console.log(stdout)
		console.log(colors.fg.green, `${options.name} ${options.subdomain} → ✔️ Hook executed`, colors.reset)
	})
}

apacheVhost()
nginxVhost()
logs()
hook()
certbot()

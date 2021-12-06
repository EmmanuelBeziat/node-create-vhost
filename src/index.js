import fs from 'fs-extra'
import { exec } from 'child_process'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

const args = yargs(hideBin(process.argv)).parse()

const params = {
	'name': args.domain.split('.')[0],
	'rootPath': `/var/www/${args.domain.split('.')[0]}/${args.subdomain}`,
	'domain': args.domain,
	'subdomain': args.subdomain || 'www',
	'subsite': args.subsite || args.subdomain || 'site',
	'port': args.port || '8085',
	'hook': args.hook,
	'hookPassphrase': args.hookpass || '',
	'certbot': args.certbot
}

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
	const content = `# ${params.subsite}
<VirtualHost *:${params.port}>
	# Server
	ServerName ${params.subdomain}.${params.domain}
	ServerAlias ${params.subdomain}.${params.domain}
	ServerAdmin contact@${params.domain}

	DocumentRoot ${params.rootPath}

	# Logs
	ErrorLog \${APACHE_LOG_DIR}/${params.name}/${params.subsite}_error.log
	CustomLog \${APACHE_LOG_DIR}/${params.name}/${params.subsite}_access.log combined
</VirtualHost>

`

	fs.outputFile(`./outputs/apache2/${params.name}.conf`, content, { flag: 'a+' })
		.then(() => console.log(colors.fg.green, `${params.name} ${params.subdomain} → ✔️ Apache Vhost created`, colors.reset))
		.catch(err => console.error(colors.fg.red, `${params.name} ${params.subdomain} → ❌ ${err}`, colors.reset))
}

/**
 * Nginx Vhost
 */
const nginxVhost = () => {
	const content = `# ${params.subsite}
server {
	listen 80;
	server_name ${params.subdomain}.${params.domain};

	include snippets/favicon_error.conf;

	location ~* ^.+.(jpg|jpeg|gif|css|png|js|ico|txt|srt|swf|woff|woff2)$ {
		root ${params.rootPath}/;
		expires 30d;
	}

	location / {
		proxy_pass http://127.0.0.1:${params.port}/;
		include /etc/nginx/conf.d/proxy.conf;
		root ${params.rootPath}/;
	}

	access_log /var/log/nginx/${params.name}/${params.subsite}_access.log;
	error_log /var/log/nginx/${params.name}/${params.subsite}_error.log info;
}

`
	fs.outputFile(`./outputs/nginx/${params.name}.conf`, content, { flag: 'a+' })
		.then(() => console.log(colors.fg.green, `${params.name} ${params.subdomain} → ✔️ Nginx Vhost created`, colors.reset))
		.catch(err => console.error(colors.fg.red, `${params.name} ${params.subdomain} → ❌ ${err}`, colors.reset))
}

/**
 * Logs
 */
const logs = () => {
	createFolder(`./outputs/logs/apache2/${params.name}/`)
	createFolder(`./outputs/logs/nginx/${params.name}/`)
}

/**
 * Hooks
 */
const hook = () => {
	if (!params.hook) return
	const hookFilePath = './outputs/hooks/hooks.json'

	if (!fs.existsSync(hookFilePath)) {
		console.log('bite')
		fs.outputFileSync(hookFilePath, '[]')
	}
	const file = fs.readFileSync(hookFilePath)

	const hooks = JSON.parse(file)

	const content = {
    id: `deploy-${params.name}`,
    "execute-command": `/usr/share/hooks/${params.name}-${params.subsite}/deploy.sh`,
    "command-working-directory": `/var/www/${params.name}/${params.subsite}/`,
    "pass-arguments-to-command":
    [
      {
        "source": "payload",
        "name": "head_commit.id"
      },
      {
        "source": "payload",
        "name": `${params.name}`
      },
      {
        "source": "payload",
        "name":  `social@${params.domain}`
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
            "secret": `${params.hookPassphrase}`,
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

	console.log(colors.fg.green, `${params.name} ${params.subdomain} → ✔️ Hooks added`, colors.reset)

const scriptContent = `#!/bin/bash

exec > /usr/share/hooks/${params.name}-${params.subsite}/output.log 2>&1

git fetch --all
git checkout --force "origin/main"
`

	fs.outputFile(`./outputs/hooks/${params.name}-${params.subsite}/deploy.sh`, scriptContent)
	console.log(colors.fg.green, `${params.name} ${params.subdomain} → ✔️ Hooks deploy script created`, colors.reset)

	exec(`chmod +x ./outputs/hooks/${params.name}-${params.subsite}/deploy.sh`, (err, stdout, stderr) => {
		if (err) {
			console.error(colors.fg.red, `${err}`, colors.reset)
			return
		}

		if (stderr) {
			console.error(colors.fg.red, `${stderr}`, colors.reset)
			return
		}

		console.log(colors.fg.green, `${params.name} ${params.subdomain} → ✔️ Hooks deploy script ready (${stdout})`, colors.reset)
	})
}

/**
 * Certbot
 */
const certbot = () => {
	if (!params.certbot) return

	exec('ls', (error, stdout, stderr) => {
		if (error) {
			console.error(colors.fg.red, `${params.name} ${params.subdomain} → ❌ ${error}`, colors.reset)
			return
		}

		if (stderr) {
			console.error(colors.fg.red, `${params.name} ${params.subdomain} → ❌ ${stderr}`, colors.reset)
			return
		}

		console.log(stdout)
		console.log(colors.fg.green, `${params.name} ${params.subdomain} → ✔️ Hook executed`, colors.reset)
	})
}

apacheVhost()
nginxVhost()
logs()
hook()
certbot()


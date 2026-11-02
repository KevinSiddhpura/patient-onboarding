# Deploying

How I put this app on my Pterodactyl panel, on my own domain, over HTTPS.

```
Browser --HTTPS--> Nginx --HTTP--> Node app in a panel container --> SQLite file
```

Nginx runs on the same machine as the panel. The app serves both the React build and the API, so there is only one thing to run.

I don't have SSH on the panel, which decides who does what:

| Who | What |
| --- | --- |
| Me, on my machine | Build the frontend, make the zips, make user lines |
| Me, in the panel | Upload files, write `.env`, type console commands |
| Panel admin | Change the egg, set up Nginx and the certificate |

## What I need first

- A domain, with an A record pointing at the panel machine.
- Ports 80 and 443 open on the machine.
- Node.js 24 on my machine.
- A panel server with about 512 MB of RAM and 1 GB of disk, and one allocation on `127.0.0.1`. Nothing else stops people reaching the app directly, so this one matters. On a public IP, the raw `http://<ip>:<port>` address would be open and unencrypted.

## 1. Ask the admin to fix the egg

The generic Node egg won't run this app as it comes. I compared against the published one ([parkervcp/eggs](https://github.com/parkervcp/eggs/blob/master/generic/nodejs/egg-node-js-generic.json)), so I check the panel's copy on the server's Startup tab, because it may have been changed.

Send the admin this:

1. **Add the Node 24 image** to the egg's Docker images and select it for the server: `ghcr.io/parkervcp/yolks:nodejs_24`. The published egg stops at Node 21, and `better-sqlite3` needs 22 or newer.
2. **Set the startup command** to:

   ```
   npm install --omit=dev && node src/server.js
   ```

   The published one checks the file name with `[[ "${MAIN_FILE}" == "*.js" ]]`. Because of the quotes it compares against the literal text `*.js`, so it never matches and always starts the app with `ts-node`.
3. **Set the start configuration** so the panel knows when the app is up. Without this the server can sit on "Starting" even though it's running:

   ```json
   { "done": "Listening on port" }
   ```

4. **Set `USER_UPLOAD` to `1`** before installing, so the egg doesn't try to clone a Git repo into the server.

## 2. Build and zip on my machine

From `own`, in PowerShell:

```powershell
cd backend; npm ci; npm test; npm run lint; cd ..
cd frontend; npm ci; npm test; npm run lint; npm run build; cd ..

tar -a -cf backend.zip -C backend src package.json package-lock.json
tar -a -cf public.zip -C frontend/dist index.html favicon.svg assets
```

I use `tar` because the panel's file manager is much easier with one zip than with a folder of files. `node_modules` doesn't go in, since the startup command installs it.

## 3. Upload to the panel

In the server's Files tab:

1. Upload `backend.zip` to `/home/container` and unarchive it.
2. Create a `public` folder, upload `public.zip` into it and unarchive it.
3. Delete both zips.
4. Create a file called `.env` in `/home/container`:

   ```
   NODE_ENV=production
   DATA_DIR=/home/container/data
   STATIC_DIR=/home/container/public
   ```

It should end up like this:

```
/home/container
├── .env
├── package.json
├── package-lock.json
├── src/
│   ├── server.js
│   ├── app.js
│   └── routes/, controllers/, services/ ...
└── public/
    ├── index.html
    ├── favicon.svg
    └── assets/
```

I don't set the port. The panel passes `SERVER_PORT` and the app uses it. Values the panel already sets win over `.env`, so `NODE_ENV` has to not be set on the Startup tab, or has to be `production` there too.

## 4. Start it and read the console

Start the server. The console should show `v24...` from the image, the npm install, then:

```
Listening on port <port>
```

Check two things:

- There's no line saying `NODE_ENV is not production`. If there is, `.env` wasn't read, so stop and fix that.
- Typing `help` prints the command list. All the admin work depends on console input reaching the app.

## 5. Ask the admin to set up Nginx

Send the admin `deploy/nginx.conf.example`, along with:

- the domain
- the allocation's IP and port (`APP_ADDRESS` in the file)

On a Debian or Ubuntu machine the steps are:

```bash
# Add only the first server block, with the real domain
sudo nano /etc/nginx/sites-available/patient-onboarding
sudo ln -s /etc/nginx/sites-available/patient-onboarding /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo certbot certonly --nginx -d example.com

# Add the second server block, replacing example.com and APP_ADDRESS
sudo nano /etc/nginx/sites-available/patient-onboarding
sudo nginx -t && sudo systemctl reload nginx
```

The panel has its own Nginx site, which shouldn't need touching. This is a separate file for a separate domain.

## 6. Add the users

On my machine, once per person:

```powershell
cd backend
npm run user:hash
```

It asks for the email, role (`receptionist` or `doctor`), name and password, then prints a `user add ...` line with only the password's hash in it. I paste that line into the panel console and check with `user list`.

The hash is what makes this safe, because the console keeps logs and a plain password shouldn't end up in them.

## 7. Check it

```powershell
curl.exe -I http://example.com             # 301 to https
curl.exe -I https://example.com            # 200
curl.exe -I http://<machine-ip>:<port>     # no connection, because it's on 127.0.0.1
```

Then in the browser:

- [ ] Sign in as the receptionist and add a patient.
- [ ] Sign in as the doctor in a second browser. The patient appears without a reload.
- [ ] Edit the patient as the doctor. The receptionist's list updates by itself.
- [ ] Leave both open for 2 minutes and change something again. It should still update, which shows the event stream survives Nginx.
- [ ] Type `flag on` in the console and press "Refresh config". The delete button appears for the doctor. Delete a patient, then `flag off`.
- [ ] Restart the server from the panel and refresh. The data is still there and I'm still signed in.
- [ ] Type `backup` and find the file in `data/backups`.

## Updating

1. Take a backup first (see below).
2. Run step 2 again.
3. Delete `src` and `public/assets` on the panel, so no old files stay behind. Don't delete `data` or `.env`.
4. Upload and unarchive the zips as in step 3, then delete them.
5. Restart the server.

New tables and columns need care. `db.js` only creates tables that don't exist yet, so changing an existing table needs its own migration.

## Backups

Type `backup` in the console, then download the file from `data/backups` in the Files tab. It's a safe copy even while the app is running. Copying `app.db` by hand while it's running isn't, because recent writes can still be in the `-wal` file.

The backups stay on the same machine until I download them, so I download them. They contain patient data, password hashes and login tokens that work for up to 7 days, so they need to be kept somewhere private.

To restore:

1. Stop the server.
2. Delete `data/app.db`, `data/app.db-wal` and `data/app.db-shm`.
3. Copy the backup to `data/app.db`.
4. Start the server.

## If something goes wrong

| What I see | What it means |
| --- | --- |
| Console mentions `ts-node` | The startup command is still the egg's default. See step 1 |
| `Cannot find package 'express'` | `npm install` didn't run. See step 1. If the admin can't change the startup command, install on my machine with `npm install --omit=dev` and upload `node_modules` in the zip as well. `better-sqlite3` includes builds for Linux, so it doesn't need compiling, but I haven't relied on this |
| Errors about the Node version or `better-sqlite3` | The server isn't on the Node 24 image. The first console line shows the version |
| `NODE_ENV is not production` | `.env` is missing, misnamed (watch for `.env.txt`) or not in `/home/container` |
| `No frontend build at ...` | `public` is missing or the files are one folder too deep. `index.html` has to be directly inside it |
| Panel stuck on "Starting" but the site works | The start configuration from step 1 isn't set |
| 502 on the domain | The server is stopped, or `APP_ADDRESS` is wrong |
| The list doesn't update live | Check `proxy_buffering off` on `/api/events`, and that no CDN is in front |
| `help` prints nothing | Console input isn't reaching the app, so the admin needs to check the egg |
| Login works but I'm signed straight back out | I'm on plain `http://`. The cookie is `Secure`, so it needs the HTTPS domain |

## Things to remember

- **Fake data only.** Security is kept basic because this is an assignment. There's no login limit, and session tokens are stored as they are. I'd add those before using it with real patients.
- **One process.** Live updates are kept in memory, so there can only be one copy of the app running.
- **Private files.** `.env` and `data` aren't in Git and must stay that way. `public` is the only folder the app serves.

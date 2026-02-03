# Unslop Frontend

Static website for getunslop.com.

## Files

- `index.html` - Landing page
- `privacy.html` - Privacy Policy
- `support.html` - Support/FAQ
- `terms.html` - Terms of Service
- `css/styles.css` - Main stylesheet
- `css/legal.css` - Legal page stylesheet

## Deployment

### Requirements

- Static hosting with HTTPS
- Custom domain support (getunslop.com)
- No build step required

### Deployment Options

**Option 1: Cloudflare Pages**
1. Connect GitHub repository
2. Set build directory to `frontend/`
3. No build command needed
4. Add custom domain in settings

**Option 2: Netlify**
1. Connect repository or drag-drop `frontend/` folder
2. No build settings needed
3. Add custom domain

**Option 3: Vercel**
1. Import project
2. Set root directory to `frontend/`
3. No build command
4. Add domain

**Option 4: GitHub Pages**
1. Push to gh-pages branch or use docs folder
2. Enable in repository settings

### DNS Configuration

For apex domain (getunslop.com):
- A record: points to hosting provider's IP
- Or CNAME flattening service

For www subdomain:
- CNAME: points to hosting provider

### No Tracking

This site intentionally has:
- No analytics scripts
- No cookies
- No tracking pixels
- No JavaScript (except optional polyfills)

## Local Testing

Simply open `index.html` in a browser, or use:

```bash
cd frontend
python3 -m http.server 8000
# Visit http://localhost:8000
```

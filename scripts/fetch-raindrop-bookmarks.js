const https = require('https');
const fs = require('fs');
const path = require('path');

const RAINDROP_TOKEN = process.env.RAINDROP_TOKEN;
const LINKS_DIR = 'content/links';

if (!RAINDROP_TOKEN) {
  console.error('Error: RAINDROP_TOKEN environment variable is not set');
  process.exit(1);
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

async function fetchImageFromUrl(url) {
  try {
    console.log(`  Fetching image from: ${url}`);
    const html = await httpsGet(url);
    
    // Try Open Graph image
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
      console.log(`  Found OG image: ${ogImageMatch[1]}`);
      return ogImageMatch[1];
    }

    // Try Twitter card image
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (twitterImageMatch) {
      console.log(`  Found Twitter image: ${twitterImageMatch[1]}`);
      return twitterImageMatch[1];
    }

    // Try to find first img tag
    const imgMatch = html.match(/<img[^>]*src=["']([^"']+)["']/i);
    if (imgMatch) {
      const imgSrc = imgMatch[1];
      if (!imgSrc.includes('1x1') && !imgSrc.includes('pixel') && !imgSrc.includes('icon')) {
        const fullImgSrc = imgSrc.startsWith('http') ? imgSrc : new URL(imgSrc, url).href;
        console.log(`  Found first image: ${fullImgSrc}`);
        return fullImgSrc;
      }
    }

    // Fallback to favicon
    const domain = extractDomain(url);
    const favicon = `https://${domain}/favicon.ico`;
    console.log(`  Using favicon fallback: ${favicon}`);
    return favicon;
  } catch (error) {
    console.error(`  Error fetching image: ${error.message}`);
    const domain = extractDomain(url);
    return `https://${domain}/favicon.ico`;
  }
}

async function fetchRaindropBookmarks() {
  try {
    console.log('Fetching bookmarks with #twil tag from Raindrop.io API...');
    const data = await httpsGet(
      'https://api.raindrop.io/rest/v1/raindrops/0?perpage=5&sort=-created&search=%23twil',
      { 'Authorization': `Bearer ${RAINDROP_TOKEN}` }
    );
    
    const response = JSON.parse(data);
    console.log(`Successfully fetched ${response.items?.length || 0} bookmarks with #twil tag`);
    return response.items || [];
  } catch (error) {
    console.error('Error fetching bookmarks:', error.message);
    process.exit(1);
  }
}

async function generateMarkdownFiles(bookmarks) {
  if (!fs.existsSync(LINKS_DIR)) {
    console.log(`Creating directory: ${LINKS_DIR}`);
    fs.mkdirSync(LINKS_DIR, { recursive: true });
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const bookmark of bookmarks) {
    try {
      const title = bookmark.title || 'Untitled';
      const url = bookmark.link;
      const createdDate = new Date(bookmark.created);
      const dateStr = createdDate.toISOString().split('T')[0];
      const slug = createSlug(title);
      
      console.log(`\nProcessing: ${title}`);
      console.log(`  URL: ${url}`);
      console.log(`  Date: ${dateStr}`);
      
      // Fetch image
      const image = await fetchImageFromUrl(url);
      
      // Add referral parameter
      const urlObj = new URL(url);
      urlObj.searchParams.set('ref', 'krabf.com');
      const externalUrl = urlObj.toString();
      
      // Create front matter
      const frontMatter = `---
title: ${title}
external_url: ${externalUrl}
image: ${image}
description: 
date: ${dateStr}
slug: ${slug}
draft: true
---
`;
      
      const filename = `${dateStr}-${slug}.md`;
      const filepath = path.join(LINKS_DIR, filename);
      
      if (fs.existsSync(filepath)) {
        console.log(`  Skipping - file already exists`);
        skippedCount++;
        continue;
      }
      
      fs.writeFileSync(filepath, frontMatter);
      console.log(`  Created: ${filename}`);
      createdCount++;
    } catch (error) {
      console.error(`  Error processing bookmark: ${error.message}`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Created: ${createdCount} files`);
  console.log(`  Skipped: ${skippedCount} files (already existed)`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Raindrop.io Bookmark Fetcher');
  console.log('='.repeat(60));
  
  const bookmarks = await fetchRaindropBookmarks();
  
  if (bookmarks.length === 0) {
    console.log('No bookmarks found.');
    return;
  }
  
  await generateMarkdownFiles(bookmarks);
  
  console.log('\nDone!');
}

main().catch(error => {
  console.error('\nFatal error:', error);
  process.exit(1);
});
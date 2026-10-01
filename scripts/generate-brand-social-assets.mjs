#!/usr/bin/env node

import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const publicRoot = path.resolve('public/social')
const sourceRoot = path.join(publicRoot, 'aerotrade-orange-v1')
const outputRoot = path.join(publicRoot, 'aerotrade-orange-v2')
const slides = ['01-hook.jpg', '02-context.jpg', '03-action.jpg']

const footer = (height) => {
  const story = height === 1920
  const x = story ? 94 : 88
  const y = height - (story ? 206 : 138)
  const width = 1080 - x * 2
  const barHeight = story ? 110 : 88
  const labelSize = story ? 27 : 24
  const domainSize = story ? 36 : 32

  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}">
      <rect x="${x}" y="${y}" width="${width}" height="${barHeight}" rx="22" fill="#020617"/>
      <text x="${x + 34}" y="${y + (story ? 70 : 57)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${labelSize}" font-weight="700">Browse current balloon equipment</text>
      <text x="${x + width - 34}" y="${y + (story ? 70 : 57)}" fill="#ff7a16" font-family="Arial, sans-serif" font-size="${domainSize}" font-weight="900" text-anchor="end">aerotrade.app</text>
    </svg>
  `)
}

const generate = async (relativePath, expectedHeight) => {
  const sourcePath = path.join(sourceRoot, relativePath)
  const outputPath = path.join(outputRoot, relativePath)
  const metadata = await sharp(sourcePath).metadata()
  if (metadata.format !== 'jpeg' || metadata.width !== 1080 || metadata.height !== expectedHeight) {
    throw new Error(`Unexpected source dimensions or format: ${relativePath}`)
  }

  const image = await sharp(sourcePath)
    .composite([{ input: footer(expectedHeight) }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer()
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, image)
}

const concepts = (await readdir(path.join(sourceRoot, 'post')))
  .filter((name) => name.endsWith('.jpg'))
  .map((name) => name.slice(0, -4))

for (const concept of concepts) {
  await generate(`post/${concept}.jpg`, 1350)
  await generate(`story/${concept}.jpg`, 1920)
  for (const slide of slides) {
    await generate(`carousel/${concept}/${slide}`, 1350)
  }
}

console.log(`Generated ${concepts.length * 5} JPEG social assets in ${outputRoot}`)

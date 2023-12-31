"use server";

import { getPostUploadsDirectory } from "./filesystemDirectories";
import { createWriteStream } from "fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ReadableStream } from "node:stream/web";
import { mkdirIfNeeded } from "@/app/lib/util";

export default async function writePostUpload(
  postBaseDirectory: string,
  file: File,
) {
  await mkdirIfNeeded(getPostUploadsDirectory(postBaseDirectory));

  const fileWriteStream = createWriteStream(
    `${postBaseDirectory}/uploads/${file.name}`,
  );
  const readStream = Readable.fromWeb(file.stream() as ReadableStream<any>);
  await pipeline(readStream, fileWriteStream);
}

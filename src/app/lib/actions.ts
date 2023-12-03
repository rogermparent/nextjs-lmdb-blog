"use server";

import { mkdir, open, readFile, rename, rm, writeFile } from "fs/promises";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  Post,
  PostEntryValue,
  getPostDatabase,
  getPostDirectory,
  getPostFilePath,
  getPostIndexEntryValue,
  getPostUploadsDirectory,
  reloadPostsDatabase,
} from "./data";
import slugify from "@sindresorhus/slugify";
import { createWriteStream } from "fs";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";

async function mkdirIfNeeded(dir: string) {
  try {
    await mkdir(dir);
  } catch (e) {
    if (((e as { code: string }).code as string) !== "EEXIST") {
      throw e;
    }
  }
}

async function mkdirIfNotPresent(dir: string) {
  try {
    await mkdir(dir);
  } catch (e) {
    if (((e as { code: string }).code as string) === "EEXIST") {
      throw new Error("Post already exists");
    } else {
      throw e;
    }
  }
}

async function writePostUpload(postBaseDirectory: string, file: File) {
  await mkdirIfNeeded(getPostUploadsDirectory(postBaseDirectory));

  const fileWriteStream = createWriteStream(
    `${postBaseDirectory}/uploads/${file.name}`,
  );
  Readable.fromWeb(file.stream() as ReadableStream<any>).pipe(fileWriteStream);
}

export async function createPost(formData: FormData) {
  const givenDate = formData.get("date") as string;
  const date = givenDate ? Number(new Date(givenDate)) : Date.now();
  const title = formData.get("title") as string;
  const body = formData.get("body") as string;
  const image = formData.get("image") as File;
  if (!title) {
    return { message: "Post needs title" };
  }
  const providedSlug = formData.get("slug");
  const slug = slugify(String(providedSlug || title));
  const data: Post = {
    image: image?.size > 0 ? image.name : undefined,
    title,
    body,
    date,
  };
  const postBaseDirectory = getPostDirectory(slug);
  await mkdirIfNotPresent(postBaseDirectory);
  await writeFile(getPostFilePath(postBaseDirectory), JSON.stringify(data));
  if (image?.size) {
    await writePostUpload(postBaseDirectory, image);
  }
  const db = getPostDatabase();
  try {
    await db.put([date, slug], getPostIndexEntryValue(data));
  } catch (e) {
    return { message: "Failed to write post" };
  } finally {
    db.close();
  }
  revalidatePath("/post/" + slug);
  revalidatePath("/posts");
  revalidatePath("/posts/[page]", "page");
  revalidatePath("/");
  redirect("/post/" + slug);
}

export async function updatePost(
  currentDate: number,
  currentSlug: string,
  formData: FormData,
) {
  const title = formData.get("title") as string;
  const newSlug = (formData.get("slug") as string) || slugify(title);
  const givenDate = formData.get("date") as string;
  const body = formData.get("body") as string;
  const newDate = givenDate && Number(new Date(givenDate + "Z"));
  const currentPostDirectory = getPostDirectory(currentSlug);
  const currentPostPath = getPostFilePath(currentPostDirectory);
  const image = formData.get("image") as File | null;

  const finalSlug = (newSlug as string) || currentSlug;
  const finalDate = newDate || currentDate;
  const finalPostDirectory = getPostDirectory(finalSlug);

  const willRename = currentPostDirectory !== finalPostDirectory;
  const willChangeDate = newDate && currentDate !== newDate;

  const currentData = JSON.parse(String(await readFile(currentPostPath)));

  const data = {
    ...currentData,
    date: finalDate,
    image: image?.name || currentData.image,
    title,
    body,
  };

  if (willRename) {
    await rename(currentPostDirectory, finalPostDirectory);
    await writeFile(`${finalPostDirectory}/post.json`, JSON.stringify(data));
  } else {
    await writeFile(currentPostPath, JSON.stringify(data));
  }
  const db = getPostDatabase();
  try {
    if (willRename || willChangeDate) {
      db.remove([currentDate, currentSlug]);
    }
    db.put([finalDate, finalSlug], getPostIndexEntryValue(data));
  } catch (e) {
    throw new Error("Failed to write post to index");
  } finally {
    db.close();
  }
  if (image) {
    await writePostUpload(finalPostDirectory, image);
  }
  if (willRename) {
    revalidatePath("/post/" + currentSlug);
  }
  revalidatePath("/post/" + finalSlug);
  revalidatePath("/");
  redirect("/post/" + finalSlug);
}

export async function deletePost(
  date: number,
  slug: string,
  _formData: FormData,
) {
  const db = getPostDatabase();
  const postDirectory = getPostDirectory(slug);
  try {
    await rm(postDirectory, { recursive: true });
    await db.remove([date, slug]);
    revalidatePath("/post/" + slug);
    revalidatePath("/");
    redirect("/");
  } catch (e) {
    throw e;
  } finally {
    db.close();
  }
}

export async function reloadPosts() {
  await reloadPostsDatabase();
  revalidatePath("/");
}

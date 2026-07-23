/** 中文注释：Multer 默认按 Latin-1 读取 multipart 的 filename 参数；浏览器实际按 UTF-8 发送，因此在进入领域层前统一还原用户可见文件名。 */
export function decodeUploadedFileName(fileName: string): string {
  return Buffer.from(fileName, "latin1").toString("utf8");
}

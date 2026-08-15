export async function getStringAsync(): Promise<string> {
  return 'clipboard from root __mocks__';
}

export async function setStringAsync(_text: string): Promise<boolean> {
  return true;
}

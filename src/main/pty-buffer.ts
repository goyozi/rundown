import { Terminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'

export class PtyTerminalBuffer {
  private term: Terminal
  private serializer: SerializeAddon

  constructor(cols = 80, rows = 24) {
    this.term = new Terminal({ cols, rows, allowProposedApi: true })
    this.serializer = new SerializeAddon()
    this.term.loadAddon(this.serializer)
  }

  write(data: string, callback?: () => void): void {
    this.term.write(data, callback)
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows)
  }

  serialize(): string {
    return this.serializer.serialize()
  }

  dispose(): void {
    this.term.dispose()
  }
}

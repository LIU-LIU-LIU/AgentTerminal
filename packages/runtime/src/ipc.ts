export class ReliableChannel {
  private queue: object[] = [];
  private sending = false;
  private retry?: ReturnType<typeof setTimeout>;
  private drained: (()=>void)[] = [];
  private paused = false;
  private broken?: Error;
  private queuedBytes = 0;
  private sizes: number[] = [];
  constructor(private transport: (message: object, callback: (error?: NodeJS.ErrnoException | null)=>void)=>void, private pause: ()=>void, private resume: ()=>void, private failed: (error: Error)=>void) {}
  push(message: object) {
    if(this.broken)return;
    const size=Buffer.byteLength(JSON.stringify(message));
    if(this.queuedBytes+size>64*1024*1024){this.fail(new Error('PTY IPC output backlog exceeded 64 MiB; task aborted to avoid losing output'));return;}
    this.queuedBytes+=size;
    this.sizes.push(size);
    this.queue.push(message);
    if(this.queue.length>=32&&!this.paused){this.paused=true;this.pause();}
    this.flush();
  }
  idle() { return this.broken || this.queue.length===0&&!this.sending?Promise.resolve():new Promise<void>(resolve=>this.drained.push(resolve)); }
  private fail(error: Error) {
    this.broken=error;this.queue=[];this.sizes=[];this.queuedBytes=0;
    for(const resolve of this.drained.splice(0))resolve();
    this.failed(error);
  }
  private flush() {
    if(this.sending||this.retry||!this.queue.length)return;
    this.sending=true;
    const complete=(error?:NodeJS.ErrnoException|null)=> {
      this.sending=false;
      if(this.broken)return;
      if(error?.code==='EAGAIN'||error?.code==='ENOBUFS') {
        this.retry=setTimeout(()=>{this.retry=undefined;this.flush();},10);
        return;
      }
      if(error){this.fail(error);return;}
      this.queuedBytes-=this.sizes.shift()!;
      this.queue.shift();
      if(this.paused&&this.queue.length<8){this.paused=false;this.resume();}
      if(!this.queue.length){for(const resolve of this.drained.splice(0))resolve();}
      this.flush();
    };
    try{this.transport(this.queue[0],complete);}catch(error){complete(error as NodeJS.ErrnoException);}
  }
}

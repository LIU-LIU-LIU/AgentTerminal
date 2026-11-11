export class ReliableChannel {
  private queue: object[] = [];
  private sending = false;
  private retry?: ReturnType<typeof setTimeout>;
  private drained: (()=>void)[] = [];
  private paused = false;
  private broken?: Error;
  constructor(private transport: (message: object, callback: (error?: NodeJS.ErrnoException | null)=>void)=>void, private pause: ()=>void, private resume: ()=>void, private failed: (error: Error)=>void) {}
  push(message: object) {
    if(this.broken)return;
    this.queue.push(message);
    if(this.queue.length>=32&&!this.paused){this.paused=true;this.pause();}
    this.flush();
  }
  idle() { return this.queue.length===0&&!this.sending?Promise.resolve():new Promise<void>(resolve=>this.drained.push(resolve)); }
  private flush() {
    if(this.sending||this.retry||!this.queue.length)return;
    this.sending=true;
    const complete=(error?:NodeJS.ErrnoException|null)=> {
      this.sending=false;
      if(error?.code==='EAGAIN'||error?.code==='ENOBUFS') {
        this.retry=setTimeout(()=>{this.retry=undefined;this.flush();},10);
        return;
      }
      if(error){this.broken=error;this.queue=[];for(const resolve of this.drained.splice(0))resolve();this.failed(error);return;}
      this.queue.shift();
      if(this.paused&&this.queue.length<8){this.paused=false;this.resume();}
      if(!this.queue.length){for(const resolve of this.drained.splice(0))resolve();}
      this.flush();
    };
    try{this.transport(this.queue[0],complete);}catch(error){complete(error as NodeJS.ErrnoException);}
  }
}

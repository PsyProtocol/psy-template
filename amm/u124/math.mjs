// Application-owned straight-line integer DSL. Never merges a U124 into one Felt.
export const B=1n<<62n, MAX=B*B-1n;
const R=1n<<30n;
export class IntegerDsl {
 constructor(){this.code=[];this.serial=0;}
 emit(s){this.code.push(s);}
 name(p='n'){return `w_${p}_${++this.serial}`;}
 range(v,n){const b=this.name('bits');this.emit(`let ${b} = psystd::split_bits(${v}, ${n});\nrequire(${Array.from({length:n},(_,i)=>`${b}[${i}].to_felt() * ${1n<<BigInt(i)}`).join(' + ')} == ${v}, "integer range");`);return b;}
 pair(v){this.range(`${v}[0]`,62);this.range(`${v}[1]`,62);return v;}
 eq(a,b){return `(${a}[0] == ${b}[0] && ${a}[1] == ${b}[1])`;}
 nonzero(a){this.pair(a);this.emit(`require(${a}[0] != 0 || ${a}[1] != 0, "zero amount");`);}
 lessLimb(a,b,n=62){const x=this.range(a,n),y=this.range(b,n),out=this.name('lt');this.emit(`let ${out} = false;\nfor bit in 0..${n} { ${out} = (!${x}[bit] && ${y}[bit]) || (${x}[bit] == ${y}[bit] && ${out}); }`);return out;}
 le(a,b,strict=false){const lo=this.lessLimb(`${a}[0]`,`${b}[0]`),hi=this.lessLimb(`${a}[1]`,`${b}[1]`);return `(${hi} || (${a}[1] == ${b}[1] && ${lo})${strict?'':` || ${this.eq(a,b)}`})`;}
 add(a,b){this.pair(a);this.pair(b);const o=this.name('sum'),s=this.name('low');this.emit(`let ${s} = ${a}[0] + ${b}[0];`);const bits=this.range(s,63);this.emit(`let ${o}: [Felt; 2] = [${s} - ${bits}[62].to_felt() * ${B}, ${a}[1] + ${b}[1] + ${bits}[62].to_felt()];`);return this.pair(o);}
 sub(a,b){this.emit(`require(${this.le(b,a)}, "integer underflow");`);const borrow=this.lessLimb(`${a}[0]`,`${b}[0]`),o=this.name('diff');this.emit(`let ${o}: [Felt; 2] = [${a}[0] + ${borrow}.to_felt() * ${B} - ${b}[0], ${a}[1] - ${b}[1] - ${borrow}.to_felt()];`);return this.pair(o);}
 constant(n){n=BigInt(n);if(n<0n||n>MAX)throw Error('U124 constant');const o=this.name('const');this.emit(`let ${o}: [Felt; 2] = [${n%B}, ${n/B}];`);return o;}
 digits(a){const lo=this.range(`${a}[0]`,62),hi=this.range(`${a}[1]`,62),bits=Array.from({length:124},(_,i)=>`${i<62?lo:hi}[${i%62}].to_felt()`);return Array.from({length:5},(_,j)=>{const v=this.name('digit');this.emit(`let ${v} = ${bits.slice(j*30,(j+1)*30).map((x,i)=>`${x} * ${1n<<BigInt(i)}`).join(' + ')||'0'};`);return v;});}
 scalar(v,bits=20){const b=this.range(v,bits);return Array.from({length:Math.ceil(bits/30)},(_,j)=>{const o=this.name('scalar_digit');this.emit(`let ${o} = ${Array.from({length:Math.min(30,bits-j*30)},(_,i)=>`${b}[${j*30+i}].to_felt() * ${1n<<BigInt(i)}`).join(' + ')};`);return o;});}
 mul(a,b){let carry='0';const out=[];for(let k=0;k<a.length+b.length;k++){const terms=[];for(let i=0;i<a.length;i++)if(k-i>=0&&k-i<b.length)terms.push(`(${a[i]}) * (${b[k-i]})`);const col=this.name('column');this.emit(`let ${col} = ${[...terms,carry].join(' + ')};`);const bits=this.range(col,63),digit=this.name('product'),next=this.name('carry');this.emit(`let ${digit} = ${Array.from({length:30},(_,i)=>`${bits}[${i}].to_felt() * ${1n<<BigInt(i)}`).join(' + ')};\nlet ${next} = (${col} - ${digit}) / ${R};`);out.push(digit);carry=next;}this.emit(`require(${carry} == 0, "product overflow");`);return out;}
 addDigits(a,b){let carry='0';const out=[];for(let i=0;i<Math.max(a.length,b.length)+1;i++){const sum=this.name('digit_sum');this.emit(`let ${sum} = ${a[i]||'0'} + ${b[i]||'0'} + ${carry};`);const bits=this.range(sum,31),d=this.name('digit');this.emit(`let ${d} = ${sum} - ${bits}[30].to_felt() * ${R};`);out.push(d);carry=`${bits}[30].to_felt()`;}this.emit(`require(${carry} == 0, "sum overflow");`);return out;}
 cmpDigits(a,b,op,message){let less='false',equal='true';for(let i=0;i<Math.max(a.length,b.length);i++){const av=a[i]||'0',bv=b[i]||'0',lt=this.lessLimb(av,bv,30),l=this.name('less'),e=this.name('equal');this.emit(`let ${l} = ${lt} || (${av} == ${bv} && ${less});\nlet ${e} = ${equal} && ${av} == ${bv};`);less=l;equal=e;}const condition=op==='=='?equal:op==='<'?less:`(${less} || ${equal})`;this.emit(`require(${condition}, "${message}");`);}
 product(a,b){return this.mul(this.digits(a),this.digits(b));}
 floor(out,numerator,denominator,message){this.cmpDigits(this.mul(this.digits(out),denominator),numerator,'<=',message);const successor=this.addDigits(this.digits(out),['1']);this.cmpDigits(numerator,this.mul(successor,denominator),'<',message);}
 text(){return this.code.join('\n');}
}

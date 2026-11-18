import { shadeColor } from "./utils.js";
import { Vec2 } from "./vec2.js?v=2";

export const FruitTypes = {
    a: { color: "#C40233", radius: 20, index: 39 },
    b: { color: "#4B0082", radius: 30, index: 3 },
    c: { color: "#FC5A8D", radius: 50, index: 26 },
    d: { color: "#D1E231", radius: 70, index: 2 },
    e: { color: "#FFE5B4", radius: 80, index: 21 },
    f: { color: "#B22222", radius: 90, index: 17 },
    g: { color: "#E5823A", radius: 100, index: 9 },
    h: { color: "#FFA500", radius: 110, index: 30 },
    y: { color: "#FFD700", radius: 120, index: 32 },
    j: { color: "#98FF98", radius: 140, index: 29 },
}

export class Fruit {

    constructor({ type, position }) {

        this.type = type;
        this.position = new Vec2(position);
        this.velocity = new Vec2();
        this.invMass = 1 / type.radius;
        this.restitution = 0.3;

        this.angle = 0;
        this.angularVelocity = 0;

        this.hits = 0;

    }

    drawFruit(ctx, radius) {
        const colors=['#ef5361','#d94a85','#8f64ce','#f6b54c','#ff9939','#e84440','#b9d86c','#ffad9c','#f4ce4e','#68b960'];
        const tier=Object.values(FruitTypes).indexOf(this.type),r=radius;
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        const gradient=ctx.createRadialGradient(-r*.3,-r*.4,r*.05,0,0,r);
        gradient.addColorStop(0,'#fff8');gradient.addColorStop(.28,colors[tier]);gradient.addColorStop(1,colors[tier]);
        ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();
        ctx.strokeStyle='#54281e33';ctx.lineWidth=Math.max(1,r*.035);ctx.stroke();
        if(tier===9){ctx.save();ctx.clip();ctx.strokeStyle='#22784866';ctx.lineWidth=r*.13;for(const x of [-.6,-.2,.2,.6]){ctx.beginPath();ctx.ellipse(r*x,0,r*.21,r*1.1,0,0,Math.PI*2);ctx.stroke();}ctx.restore();}
        if(tier===8){ctx.strokeStyle='#ab863633';ctx.lineWidth=r*.025;for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(-r,r*i*.3);ctx.lineTo(r,r*(i*.3+.6));ctx.moveTo(-r,r*i*.3);ctx.lineTo(r,r*(i*.3-.6));ctx.stroke();}}
        ctx.fillStyle='#2d7f48';ctx.beginPath();ctx.ellipse(r*.17,-r*.89,r*.28,r*.11,-.45,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#705235';ctx.lineWidth=Math.max(2,r*.06);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,-r*.82);ctx.quadraticCurveTo(-r*.08,-r*1.03,r*.07,-r*1.08);ctx.stroke();
        ctx.fillStyle='#fff5';ctx.beginPath();ctx.ellipse(-r*.36,-r*.35,r*.17,r*.28,.55,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#553e36';for(const x of [-.24,.24]){ctx.beginPath();ctx.ellipse(r*x,r*.05,r*.045,r*.065,0,0,Math.PI*2);ctx.fill();}
        ctx.strokeStyle='#553e36';ctx.lineWidth=Math.max(1.4,r*.025);ctx.beginPath();ctx.arc(0,r*.12,r*.1,0,Math.PI);ctx.stroke();
        ctx.fillStyle='#f38a8a88';for(const x of [-.39,.39]){ctx.beginPath();ctx.ellipse(r*x,r*.18,r*.09,r*.045,0,0,Math.PI*2);ctx.fill();}
    }

    render({
        context, 
        position = this.position, 
        radius = this.type.radius, 
    }) {

        // this.debug({ context, position, radius });

        const { x, y } = position;

        context.translate(x, y);
        context.rotate(this.angle);
        this.drawFruit(context, radius, this.type.index || 0);

        context.setTransform(1, 0, 0, 1, 0, 0);
    }

    debug({ 
        context, 
        position = this.position, 
        radius = this.type.radius, 
        color = this.type.color 
    }) {

        const { x, y } = position;

        context.translate(x, y);
        context.rotate(this.angle);
        context.translate(-x, -y);

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();

        const darkerColor = shadeColor(color, -20);
        context.strokeStyle = darkerColor;
        context.lineWidth = 5;
        context.stroke();

        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + radius, y);
        context.strokeStyle = darkerColor;
        context.lineWidth = 5;
        context.stroke();

        context.setTransform(1, 0, 0, 1, 0, 0);
    }

    hit(fruit) {
        const r = this.type.radius + fruit.type.radius;
        return this.position.dst2(fruit.position) < r * r;
    }

}
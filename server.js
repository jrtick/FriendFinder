var express      = require("express");
var app          = express();
var http         = require("http").createServer(app);
var bodyParser   = require("body-parser");
var fs           = require("fs");
var cookieParser = require("cookie-parser");
var sioCookie    = require("socket.io-cookie-parser");
var sio          = require("socket.io")(http);
sio.use(sioCookie());
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());


var users = {};
app.get("/",function(req,res){
  console.log("serving '/'");
  if(req.cookies.login == undefined) res.redirect("/login");
  else{
    user=req.cookies.login.username;
    pswd=req.cookies.login.password;
    if(user in users && users[user].password==pswd) res.sendFile(__dirname+"/index.html");
    else res.redirect("/login");
  }
});
app.get("/logout",function(req,res){
  users[req.cookies.login.username].online = false;
  sio.emit("offline",req.cookies.login.username);
  res.clearCookie("login");
  res.send({location:"/login"});
});

app.post("/login",function(req,res){
  user=req.body.username;
  pswd=req.body.password;
  if(user in users && users[user].password==pswd){
    users[user].online = true;
    res.cookie("login",{username:user,password:pswd},{maxAge: 1000*60*30});
    res.send({location:"/"});
  }else{
    if(user in users) res.send({error:"incorrect password"});
    else res.send({error:"user does not exist."});
  }
});

app.post("/newUser",function(req,res){
  console.log("new user requested");
  user=req.body.username;
  user = user[0].toUpperCase()+user.substring(1);
  pswd=req.body.password;
  if(user in users){
      res.send({error:"Username already taken. Try again."});
  }else{
    console.log("accepting new user "+user);
    users[user]={password:pswd,online:true,name:user,location:'unknown'};
    
    contacts = {};
    for(username in users){
      usr = users[username];
      contacts[username] = {name:usr.name,online:usr.online,location:user.location};
    }
    console.log(contacts);
    console.log(JSON.stringify(contacts));
    sio.emit("friends",contacts);
    
    res.cookie("login",{username:user,password:pswd},{maxAge: 1000*60*30});
    res.send({location:"/"});
  }
});
app.get("/login",function(req,res){ res.sendFile(__dirname+"/login.html");});
app.get("/images/*",function(req,res){ res.sendFile(__dirname+req.url);});
app.get("*",function(req,res){res.send("no.");});

messageHistory = {};
sio.on("connection",function(socket){
  var login = socket.request.cookies.login;
  if(!(login.username in users)){
    socket.emit("RESTART","/");
    return;
  }
  
  socket.username = login.username;
  messageHistory[socket.username] = {};
  socket.on("history",function(data){
    username = data.username;
    history = data.history;
    console.log(username+" history: "+JSON.stringify(history));
    messageHistory[socket.username][username] = history || []; 
  });
  
  socket.on("getHistory",function(username){
    if(messageHistory[socket.username][username]) socket.emit("history",{username:username,history:messageHistory[socket.username][username]});
  });

  socket.on("location",function(loc){
    users[socket.username].location = loc;
    sio.emit("location",{username:socket.username,pos:loc});
  });
  
  socket.on("message",function(msg){
    //for(username in users) sio.emit(username,{sender:msg.sender,message:msg.message});
    sio.emit(msg.recipient,{sender:msg.sender,message:msg.message});    
  });
  users[socket.username].online = true;
  socket.name = users[socket.username].name;
  console.log(socket.name + " connected!");
  socket.emit("name",socket.name);
  socket.emit("username",socket.username);
  contacts = {};
  for(username in users){
      user = users[username];
      contacts[username] = {name:user.name,online:user.online,location:user.location};
  }
  socket.emit("friends",contacts);
  socket.broadcast.emit("online",socket.username);

  socket.on("disconnect",function(){
    users[socket.username].online = false;
    socket.broadcast.emit("offline",socket.username);
    console.log(socket.name + " disconnected."); 
  });
  socket.on("setname",function(name){
      name = name[0].toUpperCase()+name.substring(1);
      socket.broadcast.emit("nameChange",{username:socket.username,name:name});
      users[socket.username].name = name;
      socket.name = name;
      socket.emit("name",socket.name);
  });
});

var port = 6012;
http.listen(port,function(){
  console.log("Server running on http://friendfinder.nodejs.love");
});

function getDistance(p1, p2) {
  //taken from http://stackoverflow.com/questions/1502590/calculate-distance-between-two-points-in-google-maps-v3
  var R = 6378137; // Earth’s mean radius in meter
  var dLat = rad(p2.lat - p1.lat);
  var dLong = rad(p2.lng - p1.lng);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(p1.lat)) * Math.cos(rad(p2.lat)) *
    Math.sin(dLong / 2) * Math.sin(dLong / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var d = R * c;
  return d*3.28; // returns the distance in feet
};

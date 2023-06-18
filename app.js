/* Some initialization boilerplate. Also, we include the code from
   routes/routes.js, so we can have access to the routes. Note that
   we get back the object that is defined at the end of routes.js,
   and that we use the fields of that object (e.g., routes.get_main)
   to access the routes. */

   var express = require('express');
   var routes = require('./routes.js');
   var app = express();
   app.use(express.urlencoded());
   var session = require('express-session');
   app.use(session({secret:'G25'}));
   var serveStatic = require('serve-static');
   app.use(serveStatic(__dirname + '/public'));
   

   const http = require('http');
   const server = http.createServer(app);
   const { Server } = require("socket.io"); 
   const io = new Server(server);
   /* Below we install the routes. The first argument is the URL that we
      are routing, and the second argument is the handler function that
      should be invoked when someone opens that URL. Note the difference
      between app.get and app.post; normal web requests are GETs, but
      POST is often used when submitting web forms ('method="post"'). */
   
   // TODO You will need to replace these routes with the ones specified in the handout
   app.get('/', routes.get_login);
   app.post('/checkLogin', routes.post_checkLogin);
   app.get('/signup', routes.get_signup);
   app.post('/createaccount', routes.post_createAccount);
   app.get('/home', routes.get_homepage);
   app.get('/wall', routes.get_wall);
   app.post('/addpost', routes.add_post);
   app.post('/addcomment', routes.add_comment);
   app.get('/updatepage', routes.update_page);
   app.post('/updateaccount', routes.update_account);
   app.get('/logout', routes.user_logout)
   app.get('/friends', routes.get_friends)
   app.get('/extendedFriends', routes.get_ExtFriends)
   app.get('/match', routes.get_matches)
   app.get('/search', routes.get_userSearch)
   app.get('/news', routes.get_news)
   app.get('/getusername', routes.get_username)
   app.get('/newsrec', routes.get_newsrec)
   app.get('/article', routes.like_Article)
   app.get('/getnewspage', routes.get_news_page)
   app.post('/addfriend', routes.add_friend);
   
   app.get('/loadChatsAndInvites', routes.load_chatsAndInvites);
   app.get('/chat', routes.get_chat);
   app.post('/checkChat', routes.check_chat);
   app.post('/enterChat', routes.enter_chat);
   app.get('/loadmessages', routes.load_messages);
   app.get('/loadmembers', routes.load_members);
   app.post('/addmessage', routes.add_message);
   app.get('/getAllMembers', routes.get_memberList);
   app.post('/leavechat', routes.leave_chat);
   app.post('/addGroupInvite', routes.add_groupInvite);
   app.get('/chatHome', routes.chat_home);
   app.get('/groupInvite', routes.enter_groupInvite);
   app.get('/viewprofile', routes.view_profile);
   app.post('/deletePost', routes.delete_post);
   app.post('/deletecomment', routes.delete_comment);
   app.post('/likepost', routes.like_post);

   io.on('connection', (socket) => {
      console.log('a user connected');
      socket.on('chat message', ({msg, members, curID}) => {
         console.log('members are: ' + members);
         io.emit('chat message', {msg, members, curID});
       });
      
      socket.on('disconnect', () => {
         console.log('a user disconnected');
      });
   });
   
   /* Run the server */
   
   server.listen(8080);
   console.log('Server running on port 8080. Now open http://localhost:8080/ in your browser!');
   
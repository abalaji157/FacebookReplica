var db = require('./database.js');
var SHA3 = require('crypto-js/sha3');
const { v4: uuidv4 } = require('uuid');
const { Route53Resolver } = require('aws-sdk');

var getLogin = function (req, res) {
  if (req.session.emptyLogin == true) {
    // if login values are empty, show error
    req.session.emptyLogin = false;
    res.render('homepage.ejs', { login_message: 'Please complete all fields', register_message: null });
  } else if (req.session.wrongLogin == true) {
    // if a match isn't found in the database, show error
    req.session.wrongLogin = false;
    res.render('homepage.ejs', { login_message: 'Incorrect username or password', register_message: null });
  } else if (req.session.LookUpError && req.session.LookUpError != null) {
    req.session.LookUpError = null
    res.render('homepage.ejs', { login_message: req.session.LookUpError, register_message: null });
  } else {
    res.render('homepage.ejs', { login_message: null, register_message: null });
  }
};

var checkLogin = function (req, res) {
  var username = req.body.email;
  var password = req.body.password;
  // if fields are empty, store error value
  if (username == null || password == null || username == "" || password == "") {
    req.session.emptyLogin = true;
    res.redirect('/');
  } else {
    db.lookupLogin(username, function (err, data) {
      if (err) {
        req.session.LookUpError = err;
        res.redirect('/');
      } else if (data == SHA3(password).toString()) {
        // if match is found, store session info
        db.lookupUserValue(username, 'email', function (err1, data1) {
          if (err1) {
            req.session.LookUpError = err1;
            res.redirect('/');
          } else {
            db.lookupUserValue(username, 'affiliation', function (err2, data2) {
              if (err2) {
                req.session.LookUpError = err2;
                res.redirect('/');
              } else {
                db.userOnOffline(username, true, 0, function (err3, data3) {
                  if (err3) {
                    req.session.LookUpError = err3;
                    res.redirect('/');
                  } else {
                    req.session.email = data1;
                    req.session.affiliation = data2;
                    req.session.username = username;
                    res.redirect('/home');
                  }
                })
              }
            })
          }
        })
      } else {
        // if match is not found, store error value
        req.session.wrongLogin = true;
        res.redirect('/');
      }
    });
  }
}

// sign up for new account page
var getSignup = function (req, res) {
  // if signup fields are empty, show error
  if (req.session.emptySignup == true) {
    req.session.emptySignup = false;
    res.render('homepage.ejs', { login_message: null, register_message: 'Please complete all fields.' });
  } else if (req.session.userExists == true) {
    // if username is already taken, show error
    req.session.userExists = false;
    res.render('homepage.ejs', { login_message: null, register_message: 'Username taken, please choose a different username.' });
  }
};

// creating new account
var createAccount = function (req, res) {
  var username = req.body.username;
  var password = req.body.password;
  var firstname = req.body.firstname;
  var lastname = req.body.surname;
  var email = req.body.email;
  var day = req.body.day;
  var month = req.body.month;
  var year = req.body.year;
  var dob = month + '/' + day + '/' + year;
  var aff = req.body.affiliation;
  var interest = req.body.Interest;
  if (username == "" || password == "" || firstname == "" || lastname == "" || email == "" || day == "" || month == "" || year == "" || aff == "" || !interest || !Array.isArray(interest) || interest.length < 2) {
    // if field is blank, store error value
    req.session.emptySignup = true;
    res.redirect('/signup');
  } else {
    db.addUser(username, password, firstname, lastname, dob, email, aff, interest, function (err, data) {
      if (err) {
        // if account is taken, store error value
        req.session.userExists = true;
        res.redirect('/signup');
      } else if (data) {
        // if creation is successful, store session information
        req.session.username = username;
        req.session.email = email;
        req.session.affiliation = aff;
        res.redirect('/home');
      } else {
        console.log('SIGNUP DATA');
        console.log(data);
        // if account is taken, store error value
        req.session.userExists = true;
        res.redirect('/signup');
      }
    });
  }

};

var updateAccount = function (req, res) {
  var newPassword = req.body.npw;
  var oldPassword = req.body.opw;
  var email = req.body.email;
  var affiliation = req.body.affiliation;
  var interests = req.body.Interest;
  if (email == '' || affiliation == '') {
    req.session.accountChangeMessage = 'Please enter an affilliaton and email'
    res.redirect('/updatepage')
  } else if ((newPassword != '' && oldPassword == '') || (oldPassword != '' && newPassword == '')) {
    req.session.accountChangeMessage = 'Please enter both password fields to change password'
    res.redirect('/updatepage')
  } else if (interests && !Array.isArray(interests)) {
    req.session.accountChangeMessage = 'To change interests, please check at least 2 boxes'
    res.redirect('/updatepage')
  } else {
    if (!interests) {
      interests = null
    }
    if (email != req.session.email) {
      db.addPost(req.session.username, Date.now(), uuidv4(), ('My new email is ' + email + '!'), "", [], function (err, postData) {
        if (err) {
          req.session.accountChangeMessage = err
          res.redirect('/updatepage')
        } else {
          req.session.email = email;
        }
      })
    }
    if (affiliation != req.session.affiliation) {
      db.addPost(req.session.username, Date.now(), uuidv4(), ('My new affiliation is ' + affiliation + '!'), "", [], function (err, postData) {
        if (err) {
          req.session.accountChangeMessage = err
          res.redirect('/updatepage')
        } else {
          req.session.affiliation = affiliation;
        }
      })
    }
    if (newPassword == '') {
      db.updateUser(req.session.username, newPassword, email, affiliation, interests, function (err, data) {
        if (err) {
          req.session.accountChangeMessage = err
          res.redirect('/updatepage')
        } else {
          req.session.accountChangeMessage = 'Requested fields updated'
          res.redirect('/updatepage')
        }
      })
    } else {
      db.lookupLogin(username, function (err1, data) {
        if (err1) {
          req.session.accountChangeMessage = err1
          res.redirect('/updatepage')
        } else if (data == SHA3(oldPassword).toString()) {
          db.updateUser(req.session.username, newPassword, email, affiliation, interests, function (err2, data) {
            if (err2) {
              req.session.accountChangeMessage = err2
              res.redirect('/updatepage')
            } else {
              req.session.accountChangeMessage = 'Requested fields updated'
              res.redirect('/updatepage')
            }
          })
        } else {
          req.session.accountChangeMessage = 'Incorrect password for password change'
          res.redirect('/updatepage')
        }
      })
    }
  }
};

var viewProfile = function (req, res) {
  var username = req.query.user;
//  req.session.username = username;
  console.log("GETTING PROFILE");
  console.log(username);
  if (username == null) {
    res.redirect('/');
  }
  if (username != null) {
    db.lookupUser(username, function (err, userData) {
      if (err) {
        req.session.LookUpError = err
        res.redirect('/')
      } else {
        db.getFriends(username, function (err, friendData) {
          if (err) {
            console.log('Error while fetching user posts: ' + err);
            req.session.LookUpError = err;
            res.redirect('/')
          } else {
            var results = []
            db.getPosts(username, function (err, postData) {
              if (err) {
                res.send('Error while fetching user self posts: ' + err);
              } else {
                for (post of postData) {
                  var toAdd = post
                  db.getComments(post.postID.S, function (err, usercomment) {
                    if (err) {
                      console.log('Error while fetching user comments: ' + err);
                      req.session.LookUpError = err;
                      res.redirect('/')
                    } else {
                      toAdd["comments"] = usercomment
                      results.push(toAdd)
                    }
                  })
                }
                for (friend of friendData) {
                  db.getPosts(username, function (err, data) {
                    if (err) {
                      console.log('Error while fetching friend posts: ' + username + '\n error: ' + err)
                      req.session.LookUpError = err;
                      res.redirect('/')
                    } else {
                      for (post of data) {
                        if (post.wall.S != username) {
                          var toAdd = post
                          db.getComments(post.postID.S, function (err, usercomment) {
                            if (err) {
                              console.log('Error while fetching user comments: ' + err);
                              req.session.LookUpError = err;
                              res.redirect('/')
                            } else {
                              toAdd["comments"] = usercomment
                              results.push(toAdd)
                            }
                          })
                        }
                      }
                    }
                  })
                }
                setTimeout(() => {
                  results.sort(function (a, b) {
                    if (a.timestamp.N > b.timestamp.N) {
                      return -1;
                    }
                    else {
                      return 1;
                    }
                  })
                  res.render('profile.ejs', { user: userData, posts: results, friends: {}})
                }, 200);
              }
            })
          }
        });
      }
    })

  }
}

var getUserWall = function (req, res) {
  var username = req.session.username;
  if (username == null || username == "") {
    res.redirect('/')
  }
  if (username != null) {
    db.lookupUser(username, function (err, userData) {
      db.getFriends(username, function (err, friendData) {
        if (err) {
          console.log('Error while fetching user posts: ' + err);
          req.session.LookUpError = err;
          res.redirect('/')
        }
        else {
          var results = [];
          var friendResults = [];
          db.getPosts(username, function (err, postData) {
            if (err) {
              res.send('Error while fetching user self posts: ' + err);
            }
            else {
              for (post of postData) {
                var toAdd = post;
                db.getComments(post.user_relation.S, function (err, usercomment) {
                  if (err) {
                    console.log('Error while fetching user comments: ' + err);
                    req.session.LookUpError = err;
                    res.redirect('/');
                  } else {
                    toAdd["comments"] = usercomment;
                    results.push(toAdd);
                  }
                });
              }

              for (var friend of friendData) {
                if (friend.friend != null) {
                  console.log(friendData)
                  console.log(friendData[0])
                  db.lookupUserValue(friend.friend.S, "online", function (err, onlineStatus) {
                    var toAddFriendObj = friend;
                    toAddFriendObj["online"] = onlineStatus;
                    friendResults.push(toAddFriendObj);

                    db.getPosts(friend.friend.S, function (err, friendPostData) {
                      if (err) {
                        console.log('Error while fetching friend posts: ' + friend.friend.S + '\n error: ' + err)
                        req.session.LookUpError = err;
                        res.redirect('/');
                      } else {
                        for (post of friendPostData) {
                          if (post.wall.S == username) {
                            var toAddFriends = post;
                            db.getComments(post.user_relation.S, function (err, usercomment) {
                              if (err) {
                                console.log('Error while fetching friend comments: ' + err);
                                req.session.LookUpError = err;
                                res.redirect('/');
                              } else {
                                toAddFriends["comments"] = usercomment;
                                results.push(toAddFriends);
                              }
                            });
                          }
                        }
                      }
                    });

                  });
                }
              }

              setTimeout(() => {
                results.sort(function (a, b) {
                  if (parseInt(a.timestamp.S) > parseInt(b.timestamp.S)) {
                    return -1;
                  }
                  else {
                    return 1;
                  }
                });

                console.log("RESULTS");
                console.log(results);
                console.log("FRIENDS RESULTS")
                console.log(friendResults);
                res.render('walls.ejs', { "user": userData, "posts": results, "friends": friendResults });
              }, 1000);
            }
          })
        }
      });
    });
  }

    //   db.lookupUser(username, function (err, userData) {
    //     if (err) {
    //       req.session.LookUpError = err
    //       res.redirect('/')
    //     } else {
    //       db.getFriends(username, function (err, friendData) {
    //         if (err) {
    //           console.log('Error while fetching user posts: ' + err);
    //           req.session.LookUpError = err;
    //           res.redirect('/')
    //         } else {
    //           var results = []
    //           db.getPosts(username, function (err, postData) {
    //             if (err) {
    //               res.send('Error while fetching user self posts: ' + err);
    //             } else {
    //               for (post of postData) {
    //                 var toAdd = post
    //                 db.getComments(post.postID.S, function (err, usercomment) {
    //                   if (err) {
    //                     console.log('Error while fetching user comments: ' + err);
    //                     req.session.LookUpError = err;
    //                     res.redirect('/')
    //                   } else {
    //                     toAdd = {
    //                       ...toAdd,
    //                       ...usercomment
    //                     }
    //                     results.push(toAdd)
    //                   }
    //                 })
    //               }
    //               for (friend of friendData) {
    //                 db.getPosts(username, function (err, data) {
    //                   if (err) {
    //                     console.log('Error while fetching friend posts: ' + username + '\n error: ' + err)
    //                     req.session.LookUpError = err;
    //                     res.redirect('/')
    //                   } else {
    //                     for (post of data) {
    //                       if (post.wall.S != username) {
    //                         var toAdd = post
    //                         db.getComments(post.postID.S, function (err, usercomment) {
    //                           if (err) {
    //                             console.log('Error while fetching user comments: ' + err);
    //                             req.session.LookUpError = err;
    //                             res.redirect('/')
    //                           } else {
    //                             toAdd = {
    //                               ...toAdd,
    //                               ...usercomment
    //                             }
    //                             results.push(toAdd)
    //                           }
    //                         })
    //                       }
    //                     }
    //                   }
    //                 })
    //               }
    //               setTimeout(() => {
    //                 results.sort(function (a, b) {
    //                   if (a.timestamp.N > b.timestamp.N) {
    //                     return -1;
    //                   }
    //                   else {
    //                     return 1;
    //                   }
    //                 })
    //                 res.render('index.ejs', { user: userData, posts: results, friends: {}})
    //               }, 200);
    //             }
    //           })
    //         }
    //       });
    //     }
    //   })

    // }
  }

  var getHomepage = function (req, res) {
    var username = req.session.username;
    if (username == "" ) {
      res.redirect('/')
    }
    // if (username == null) {
    //   res.session.LookUpError = "You have not logged in"
    //   res.redirect('/');
    // }
    if (username != null) {
      db.lookupUser(username, function (err, userData) {
        db.getFriends(username, function (err, friendData) {
          if (err) {
            console.log('Error while fetching user posts: ' + err);
            req.session.LookUpError = err;
            res.redirect('/')
          }
          else {
            var results = [];
            var friendResults = [];
            db.getPosts(username, function (err, postData) {
              if (err) {
                res.send('Error while fetching user self posts: ' + err);
              }
              else {
                for (post of postData) {
                  var toAdd = post;
                  db.getComments(post.user_relation.S, function (err, usercomment) {
                    if (err) {
                      console.log('Error while fetching user comments: ' + err);
                      req.session.LookUpError = err;
                      res.redirect('/');
                    } else {
                      toAdd["comments"] = usercomment;
                      results.push(toAdd);
                    }
                  });
                }

                if (friendData.length > 0) {
                  for (friend of friendData) {
                    if (friend.friend != null) {
                      console.log(friendData)
                      console.log(friendData[0])
                      db.lookupUserValue(friend.friend.S, "online", function (err, onlineStatus) {
                        var toAddFriendObj = friend;
                        toAddFriendObj["online"] = onlineStatus;
                        friendResults.push(toAddFriendObj);
  
                        db.getPosts(friend.friend.S, function (err, friendPostData) {
                          if (err) {
                            console.log('Error while fetching friend posts: ' + friend.friend.S + '\n error: ' + err)
                            req.session.LookUpError = err;
                            res.redirect('/');
                          } else {
                            for (post of friendPostData) {
                              var toAddFriends = post;
                              db.getComments(post.user_relation.S, function (err, usercomment) {
                                if (err) {
                                  console.log('Error while fetching friend comments: ' + err);
                                  req.session.LookUpError = err;
                                  res.redirect('/');
                                } else {
                                  toAddFriends["comments"] = usercomment;
                                  results.push(toAddFriends);
                                }
                              });
                            }
                          }
                        });
  
                      });
                    }
                  }
                }
                

                setTimeout(() => {

                  results.sort(function (a, b) {
                    if (parseInt(a.timestamp.S) > parseInt(b.timestamp.S)) {
                      return -1;
                    }
                    else {
                      return 1;
                    }
                  });

                  console.log("RESULTS");
                  console.log(results);
                  console.log("FRIENDS RESULTS")
                  console.log(friendResults);
                  res.render('index.ejs', { "user": userData, "posts": results, "friends": friendResults });
                }, 1000);
              }
            })
          }
        });
      });
    };
  }

  var getTrending = function (req, res) {
    db.getTrendingPosts(req.body.hashtag, function (err, data) {
      if (err) {
        console.log(err)
      } else {
        res.render('index.ejs', { posts: data })
      }
    })
  }

  var addPost = function (req, res) {
    var username = req.session.username;
    var timestamp = Date.now();
    var text = req.body.input;
    var postId = uuidv4();
    var wall = ""
    var hashtags = [""]
    if (req.body.wall) {
      wall = req.body.wall;
    }
    if (req.body.hashtags) {
      hashtags = req.body.hashtags;
    }
    db.addPost(username, timestamp, postId, text, wall, hashtags, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log(data)
        res.send('success')
      }
    });
  }

  var updatePost = function (req, res) {
    var username = req.session.username;
    var timestamp = Date.now();
    var text = req.body.input;
    var postId = uuidv4();
    db.updatePost(username, timestamp, postId, text, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        res.redirect('/home');
      }
    });
  }

  var addComment = function (req, res) {
    var timestamp = Date.now();
    console.log('tiemstamp: ' + timestamp);
    var text = req.body.input;
    var postId = req.body.postId;
    var username = req.session.username;
    var commentId = uuidv4();

    db.addComment(postId, commentId, text, timestamp, username, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log('here');
        console.log(data);
        res.send('comment added', 200);
      }
    });
  }

  var updatePage = function (req, res) {
    username = req.session.username

    if (username != null) {
      if (req.session.accountChangeMessage) {
        res.render('accountChanges.ejs', {
          emailVal: req.session.email, affiliationVal: req.session.affiliation,
          user: req.session.username, message: req.session.accountChangeMessage
        })
      } else {
        res.render('accountChanges.ejs', {
          emailVal: req.session.email, affiliationVal: req.session.affiliation,
          user: req.session.username, message: null
        })
      }
    }
  };



  var getExtFriends = function (req, res) {
    var username;
    if (req.query.username) {
      username = req.query.username;
    } else {
      username = req.session.username;
    }

    if (username != null) {
      db.getFriends(username, function (err, data) {
        if (err) {
          console.log(err)
        } else {
          res.send({ "user": username, "friends": data }, 200);
        }
      })
    }
  }

  var addRequest = function (req, res) {
    var username = req.session.username;
    var timestamp = Date.now();
    var friendName = req.body.friendName
    db.addRequest(username, friendName, timestamp, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("request data" + data);
      }
    })
  }

  var getFriendsPage = function (req, res) {
    var username;
    if (req.query.username) {
      username = req.query.username;
    } else {
      username = req.session.username;
    }
    if (username != null) {
      db.lookupUser(username, function (err, userData) {
        if (err) {
          res.redirect('/', req.session.LookUpError = err)
        } else {
          db.getFriends(username, function (err, friendData) {
            if (err) {
              console.log(err)
            } else {
              db.getRequests(username, function (err, requestData) {
                if (err) {
                  console.log(err)
                } else {
                  res.render('friends.ejs', { user: userData, requests: requestData, friends: friendData })
                }
              })
              //TODO: vishakh render something sending the data from friends here on the frontend, maybe get pfp too for the list of friends

            }
          })
        }
      })
    }
  }

  var addFriend = function (req, res) {
    var username = req.session.username;
    var timestamp = Date.now();
    var friendName = req.body.friendName;
    console.log(req.body);
    console.log("GETTING FRIEND");
    console.log(username);
    console.log(friendName);
    db.addFriend(username, friendName, timestamp, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("friends data" + data)
        res.redirect('/home');
      }
    });
  }

  var deleteFriend = function (req, res) {
    var username = req.session.username;
    var friendName = req.body.friendName
    db.deleteFriend(username, friendName, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("friends data" + data)
      }
    });
  }

  var deletePost = function (req, res) {
    var username = req.session.username;
    var postID = req.body.postID
    db.deletePost(username, postID, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("delete post data" + data)
      }
    });
  }

  var likePost = function (req, res) {
    var username = req.session.username;
    var postId = req.body.postId;
    console.log("REACHED");
    console.log(postId);
    db.likePost(username, postId, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("like post data" + data)
        res.send(postId, 200);
      }
    });
  }

  var deleteComment = function (req, res) {
    var postID = req.body.postID;
    var commentID = req.body.commentID;
    db.deleteComment(postID, commentID, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("delete comment data" + data)
      }
    });
  }

  var likeComment = function (req, req) {
    var postID = req.session.postID;
    var commentID = req.body.commentID;
    db.likeComment(postID, commentID, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log("comment like data" + data)
      }
    });
  }

  var getUsername = function (req, res) {
    //we need username to see if restaurants added by current user
    if (req.session.username) {
      res.send(JSON.stringify(req.session.username));
    } else {
      res.redirect('/');
    }
  }


  var logout = function (req, res) {
    var timestamp = Date.now();
    db.userOnOffline(req.session.username, false, timestamp, function (err, data) {
      if (err) {
        console.log(err)
        req.session.destroy();
        req.session.LookUpError = err;
        res.redirect('/');
      } else {
        req.session.destroy();
        res.redirect('/');
      }
    })
  }

var matchFriendAutocomplete = function (req, res) {
  db.getUsers(function (err, data) {
    if (err) {
      console.log(err)
      res.send(JSON.stringify(""))
    } else {
      res.send(JSON.stringify(data.filter(value => value.includes(req.query.search))))
    }
  })
}

  var getNews = function (req, res) {
    // console.log("CALLING GETNEWS IN ROUTES" + req.query.search)

    db.getNews(req.query.search, function (err, data) {
      if (err) {
        console.log(err)
        res.send(JSON.stringify(""))
      } else {
        // console.log(data)
        res.send(JSON.stringify(data))
      }
    })
  }

var getNewsPage = function(req, res) {
  if(req.session.username == null || req.session.username =="") {
    res.redirect('/')
  }
  db.lookupUser(req.session.username, function (err, userData) {
    res.render('news.ejs', {user: userData});
  })
};

  var userSearch = function (req, res) {
    res.send(req.query.userSearch)
  }


  var getNewsrec = function (req, res) {
    db.get_newsrec(req.session.username, function (err, data) {
      if (err) {
        console.log(err)
        res.send(JSON.stringify(""))
      } else {
        // console.log(data)
        res.send(JSON.stringify(data))
        // console.log('sent')
      }
  })}


var checkChat = function (req, res) {
  var friend = req.body.friend;
  var username = req.session.username;
  console.log('username: ' + username);
  db.getFriends(username, function(err, data) {
    if (err) {
      console.log(err);
    }
    else {
      console.log('DAT AND FRIENDS');
      console.log(data);
      var friends = []; 
      
      for (item of data) {
        friends.push(item.friend.S);
        console.log(item.friend.S);
      }
      console.log(friend);
      if (friends.includes(friend)) {
        db.friendOnline(friend, function(err1, data1) {
          if (err1) {

          }
          else {
            console.log('DATA1');
            console.log(data1);
            if (data1 == 't') {
              db.addInvite(username, friend, function (err3, data3) {
                if (err3) {
                  console.log(err3);
                }
                else {
                  res.redirect('/chat');
                }
              });
            }
            else {
              res.redirect('/chat');
            }
          }
        })
      }
      else {
        res.redirect('/chat');
      }
    }
  });

}



  var loadChatsAndInvites = function (req, res) {
    //get all chats that user is in 
    username = req.session.username;
    curChats = [];
    curInvites = [];
    db.getInvites(username, function (err, data) {
      if (err) {
        console.log('error with retrieving invites');
      }
      else {


        for (item of data.Items) {

          var sender = item.user_relation.S;
          curInvites.push(sender.substr(7, sender.length));

        }
        db.getChats(username, function (err, data) {
          if (err) {

          }
          else {


            if (data.length != undefined && data.length > 0) {
              for (const item of data) {
                console.log(item);
                curChats.push(item.S);
              }
            }


            db.getGroupInvites(username, function (err1, data1) {
              if (err1) {
                console.log(err1);
              }
              else {

                groupIDs = [];
                groupInviters = [];

                if ((data1.Items != undefined && data1.Items.length > 0) || (data1.length != undefined && data1.length > 0)) {

                  for (item of data1.Items) {
                    groupInviters.push(item.user_relation.S.substr(6, item.user_relation.S.length));
                    groupIDs.push(item.inviteID.S);
                  }
                }

                console.log(groupIDs);
                console.log(groupInviters);
                res.render('tempchat.ejs', { chats: curChats, invites: curInvites, groupIDs: groupIDs, groupInviters: groupInviters });
                // res.send({chats: JSON.stringify(curChat), invites: JSON.stringify(curInvites), 
                //   groupIDs: JSON.stringify(groupIDs), groupInviters: JSON.stringify(groupInviters)});
              }

            })

          }
        });
      }
    });
  }

  var loadMessages = function (req, res) {
    console.log('THe id is: ' + req.query.id);
    chatId = req.query.id;
    db.loadMessages(chatId, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        var messages = []
        if (data.Items[0].messages) {
          for (item of data.Items[0].messages.L) {
            messages.push(item.S);
          }
        }
        res.send(JSON.stringify(messages));
      }
    });
  }

  var getMembersList = function (ids, req, res) {
    db.getMemberList(ids, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log(data);
        res.send(JSON.stringify(data));
      }
    });
  }

  var loadMembers = function (req, res) {
    chatId = req.query.id;
    console.log(chatId);
    console.log('CHAT ID');
    members = [];
    db.getMembers(chatId, function (err, data) {
      if (err) {

      }
      else {
        if (data.Items[0]) {
          for (item of data.Items[0].members.L) {
            members.push(item.S);
          }
        }
        console.log('MEMBERS');
        console.log(chatId);
        console.log(JSON.stringify(members));
        res.send(JSON.stringify(members));
      }
    });
  }

  var enterChat = function (req, res) {
    var username = req.session.username;
    var inviter = req.body.inviteAccept;
    var rejecter = req.body.inviteReject;
    //inviting one person
    var chatID = req.body.name;

    console.log(inviter);
    if (chatID) {
      db.getMembers(chatID, function (err, data) {
        if (err) {
          console.log(err);
        }
        else {

          var curMembers = []

          for (member of data.Items[0].members.L) {
            curMembers.push(member.S);
          }

          res.render('chat.ejs', { members: curMembers, id: chatID, username: req.session.username });
        }
      })
    }

    else if (inviter) {

      var members = [];
      members.push(username);
      members.push(inviter);
      db.getChats(username, function (err, data) {
        if (err) {
          console.log(err);
        }
        else {
          chats = [];
          console.log('chatsData');
          console.log(data == []);
          console.log(data.length);
          if (data.length != undefined && data.length != 0) {
            for (chat of data) {
              chats.push(chat.S);
            }
            console.log('PREITEM');
            for (item of chats) {
              console.log(item);
            }
            console.log('397');
            db.findMatching(chats, members, function (err, data) {
              if (err) {
                console.log('496: ' + err);
              }
              else {
                console.log('LENGTH: ' + data.length);
                if (data.length > 0) {
                  curId = data[0];
                  db.removeInvite(username, inviter, function (err, data) {
                    if (err) { console.log(err); }
                    else {
                      res.render('chat.ejs', { id: curId, members: members, username: username });
                    }
                  }
                  )
                }
                else {
                  console.log('WEVE ARRIVED HERE HELLO');
                  var newid = uuidv4();
                  db.removeInvite(username, inviter, function (err, data) {
                    console.log('REMOVED THE INVITE');
                    if (err) {
                      console.log(err);
                    }
                    else {
                      db.addChat(newid, members, username, function (err1, data1) {
                        if (err1) {
                          console.log('ERRROR11');
                          console.log(err1);
                        }
                        else {
                          db.chatToUser(newid, members, username, function (err2, data2) {
                            if (err2) {
                              console.log('ERROROROR2');
                              console.log(err2);
                            }
                            else {
                              res.render('chat.ejs', { id: newid, members: members, username: username });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              }
            });
          }
          else {
            console.log('Else statement');
            var newid = uuidv4();
            db.removeInvite(username, inviter, function (err, data) {
              console.log('REMOVED THE INVITE');
              if (err) {
                console.log(err);
              }
              else {
                db.addChat(newid, members, username, function (err1, data1) {
                  if (err1) {
                    console.log('ERRROR11');
                    console.log(err1);
                  }
                  else {
                    db.chatToUser(newid, members, username, function (err2, data2) {
                      if (err2) {
                        console.log('ERROROROR2');
                        console.log(err2);
                      }
                      else {
                        db.chatToUser(newid, members, inviter, function (err3, data3) {
                          if (err3) {
                            console.log(err3);
                          }
                          else {
                            res.render('chat.ejs', { id: newid, members: members, username: username });
                          }
                        });
                      }
                    });
                  }
                });
              }
            });
          }


        }
      });

    }
    else {
      db.removeInvite(username, rejecter, function (err, data) {
        if (err) {
          console.log(err);
        }
        else {
          res.redirect('/chat');
        }
      })
    }

    //check if they are online or they are friend
  }

  var checkChatExists = function (username, inviter) {
    var members = [];
    members.push(username);
    members.push(inviter);
    db.getChats(username, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        chats = [];

        for (chat of data) {

          chats.push(chat.S);
        }

        for (item of chats) {
          console.log(item);
        }
        db.findMatching(chats, members, function (err, data) {
          if (err) {
            console.log('496: ' + err);
          }
          else {
            return data;
          }
        });


      }
    });

  }

  var addMessage = function (req, res) {

    const obj = req.body;
    console.log('startedhere');
    var chatID = JSON.parse(Object.keys(obj)[0]).chatID;
    var user = JSON.parse(Object.keys(obj)[0]).user;
    var message = JSON.parse(Object.keys(obj)[0]).message;

    db.loadMessages(chatId, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        var messages = []
        for (item of data.Items[0].messages.L) {
          console.log(item.S);

          messages.push(item.S);
        }
        messages.push(message);
        console.log('new NESSAGES');
        console.log(messages);

        db.addMessage(chatID, messages, function (err2, data2) {
          if (err2) {
            console.log(err);
          }
          else {
            console.log(data2);
          }
        });
      }
    });

  }

  var leaveChat = function (req, res) {
    console.log(req.body);
    var username = req.body.user.split(',')[0];
    var chatID = req.body.user.split(',')[1];
    console.log('USERNAME IS : ' + username);
    console.log(chatID);
    db.removeChat(username, chatID, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        res.redirect('/chat');
      }
    });
  }


  var addGroupInvite = function (req, res) {
    console.log('Entered heree');
    var friend = req.body.friend;
    var members = req.body.chatMembers.split(',');
    var chatID = req.body.chatID;
    var sender = req.body.sender;
    console.log(members);
    db.addGroupInvite(friend, members, sender, chatID, function (err, data) {
      if (err) {
        console.log(err);
      }
      else {
        console.log('HERE');
        console.log(data);
        res.redirect('/chat');
      }
    });
  }

  var chatHome = function (req, res) {
    res.redirect('/chat');
  }

  var enterGroupInvite = function (req, res) {
    console.log('REQUEST');
    console.log(req.query);
    var inviter = req.query.accept.split(',')[0];
    var id = req.query.accept.split(',')[1];
    db.getMembers(id, function (err, data) {
      if (err) {

      }
      else {
        console.log('here');
        console.log(data.Items[0].members.L);
        var members = [];
        for (item of data.Items[0].members.L) {
          members.push(item.S);
        }
        members.push(req.session.username);
        console.log(members);
        console.log('Mmebers');

        db.getChats(username, function (err, data) {
          if (err) {
            console.log(err);
          }
          else {
            console.log('Made it to get chats');
            chats = [];
            console.log(data);
            console.log('data');
            console.log(data.Items);
            if (data.length != undefined && data.length != 0) {

              for (chat of data) {
                chats.push(chat.S);
              }

              for (item of chats) {
                console.log(item);
              }

              db.findMatching(chats, members, function (err, data) {
                console.log('entered find matching');
                if (err) {
                  console.log('496: ' + err);
                }
                else {
                  console.log('FOUND MATCHING CHAT CHECK');
                  if (data.length > 0) {
                    curId = data[0];
                    console.log('ID OF EXISTING CHAT: ' + curId);
                    db.removeGroupInvite(username, inviter, function (err, data) {
                      if (err) { console.log(err); }
                      else {
                        console.log('672: ' + curId);
                        res.render('chat.ejs', { id: curId, members: members, username: username });
                      }
                    }
                    )
                  }
                  else {

                    var newid = uuidv4();
                    console.log(newid);
                    db.removeGroupInvite(username, inviter, function (err, data) {
                      console.log('REMOVED THE INVITE');
                      if (err) {
                        console.log(err);
                      }
                      else {
                        console.log('before add batch chats is called');
                        db.addBatchChats(newid, members, username, function (err1, data1) {
                          console.log('ENTERED BATCH CHATS');
                          if (err1) {
                            console.log('ERRROR11');
                            console.log(err1);
                          }
                          else {

                            console.log('NULL AND HERE');
                            console.log(newid);
                            db.addChat(newid, members, username, function (err2, data2) {
                              if (err2) {
                                console.log('ERROROROR2');
                                console.log(err2);
                              }
                              else {
                                console.log(data2);
                                res.render('chat.ejs', { id: newid, members: members, username: username });
                              }
                            });
                          }
                        });
                      }
                    });
                  }
                }
              });
            }
            else {
              console.log('Else statement');
              var newid = uuidv4();
              db.removeInvite(username, inviter, function (err, data) {
                console.log('REMOVED THE INVITE');
                if (err) {
                  console.log(err);
                }
                else {
                  db.addChat(newid, members, username, function (err1, data1) {
                    if (err1) {
                      console.log('ERRROR11');
                      console.log(err1);
                    }
                    else {
                      db.addBatchChats(newid, members, username, function(err2, data2) {
                        if (err2) {
                          console.log(err2);
                        }
                        else {
                          console.log('RENDERED');
                          res.render('/chat.ejs', {id: newid, members: members, username: username })
                        }
                      });
                    }
                  });
                }
              });
            }


          }
        });
      }
    })
  }

  var renderChat = function (req, res) {
    res.render('tempchat.ejs');
  }


  var likeArticle = function (req, res) {
    var arr = req.query.like.split(':')
    // console.log("split: " + arr)
    // console.log(req.query.like)
    console.log('likeArticle' + arr[2])
    db.likeArticle(req.session.username, arr[2], function (err, data) {
      console.log('db call')
      if (err) {
        console.log(err)
        // res.send(JSON.stringify(""))
      } else {
        // console.log(data)
        // res.send(JSON.stringify(data))
        // console.log('sent')
      }})}
  // The name before the colon is the name you'd use for the function in app.js; the name after the colon is the name the method has here, in this file.

  var routes = {
    user_logout: logout,
    get_username: getUsername,
    get_login: getLogin,
    post_checkLogin: checkLogin,
    get_signup: getSignup,
    post_createAccount: createAccount,

    add_post: addPost,
    delete_post: deletePost,
    like_post: likePost,
    get_trending: getTrending,

    add_comment: addComment,
    delete_comment: deleteComment,
    like_comment: likeComment,

    update_Post: updatePost,
    get_wall: getUserWall,
    get_homepage: getHomepage,
    update_account: updateAccount,
    update_page: updatePage,

    add_friend: addFriend,
    delete_friend: deleteFriend,
    get_friends: getFriendsPage,
    get_ExtFriends: getExtFriends,
    add_request: addRequest,

    get_userSearch: userSearch,
    get_news: getNews,
  get_news_page: getNewsPage,

    get_chat: loadChatsAndInvites,
    check_chat: checkChat,
    load_chatsAndInvites: loadChatsAndInvites,
    enter_chat: enterChat,
    load_messages: loadMessages,
    load_members: loadMembers,
    add_message: addMessage,
    get_memberList: getMembersList,
    leave_chat: leaveChat,
    add_groupInvite: addGroupInvite,
    chat_home: chatHome,
    enter_groupInvite: enterGroupInvite,



    view_profile: viewProfile,
  
  get_matches: matchFriendAutocomplete,
  get_userSearch: userSearch,
  get_news: getNews,
  get_newsrec: getNewsrec,
  like_Article: likeArticle,
};

  module.exports = routes;

const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});

const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    // host: 'localhost',
    // user: 'root',
    // password: 'Republic_C207',
    // database: 'C328TravelWishList_jetbackbuy'
    host: 'zxw6ws.h.filess.io',
    port: 3307,
    user: 'C328TravelWishList_jetbackbuy',
    password: '427766ceea97ead6c7975d85ac90ea584f82a776',
    database: 'C328TravelWishList_jetbackbuy'
  });

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

// Set up view engine
app.set('view engine', 'ejs');
//  enable static files
app.use(express.static('public'));
// enable form processing
app.use(express.urlencoded({
    extended: false
}));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } 
}));

app.use(flash());

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    } else {
        req.flash('error', 'Please log in to view this resource');
        res.redirect('/login');
    }
};

const checkAdmin = (req, res, next) => {
    if (req.session.user.accounttype === 'admin') {
        return next();
    } else {
        req.flash('error', 'Access denied');
        res.redirect('/'); 
    }
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, contact, accounttype } = req.body;

    if (!username || !email || !password  || !contact || !accounttype) {
        return res.status(400).send('All fields are required.');
    }
    
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 or more characters long');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

app.get('/',  (req, res) => {
    res.render('index', {user: req.session.user} );
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {

    const { username, email, password, contact, accounttype } = req.body;

    const sql = 'INSERT INTO users (username, email, password, contact, accounttype) VALUES (?, ?, SHA1(?), ?, ?)';
    connection.query(sql, [username, email, password,  contact, accounttype], (err, result) => {
        if (err) {
            throw err;
        }
        console.log(result);
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }

    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) {
            console.error('Login query error:', err);
            req.flash('error', 'Something went wrong. Please try again.');
            return res.redirect('/login');
        }

        if (results.length > 0) {
            req.session.user = results[0];
            req.flash('success', 'Login successful!');

            if (req.session.user.accounttype === 'admin') {
                return res.redirect('/country');
            } else {
                return res.redirect('/country');
            }
        } else {
            req.flash('error', 'Invalid email or password.');
            return res.redirect('/login');
        } 
    });
});

app.get('/country', checkAuthenticated, (req, res) => {
    connection.query('SELECT * FROM country', (error, results) => {
        if (error) throw error;

        console.log("All countries:", results);

        res.render('country', { 
            country: results,      
            user: req.session.user 
        });
    });
});

app.get('/country/:id', checkAuthenticated, (req, res) => {
  const countryId = req.params.id;

  connection.query('SELECT * FROM country WHERE countryId = ?', [countryId], (error, results) => {
      if (error) throw error;

      if (results.length > 0) {
          res.render('country', { country: results[0], user: req.session.user  });
      } else {
          res.status(404).send('country not found');
      }
  });
});

app.get('/country/:id/list', checkAuthenticated, (req, res) => {
    const countryId = req.params.id;

    const countryQuery = 'SELECT * FROM country WHERE countryId = ?';
    const listQuery = `
        SELECT l.*, c.countryName, c.image AS countryImage
        FROM list l
        JOIN country c ON l.countryId = c.countryId
        WHERE c.countryId = ?
    `;

    connection.query(countryQuery, [countryId], (err, countryResults) => {
        if (err) throw err;

        if (countryResults.length === 0) {
            return res.status(404).send('Country not found');
        }

        connection.query(listQuery, [countryId], (err, listResults) => {
            if (err) throw err;

            res.render('list', {
                user: req.session.user,
                country: countryResults[0],
                list: listResults            
            });
        });
    });
});

app.post('/add-to-wishlist/:id', checkAuthenticated, (req, res) => {
    const destinationId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;

    connection.query('SELECT * FROM destination WHERE destinationId = ?', [destinationId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const destination = results[0];

            if (!req.session.wishlist) {
                req.session.wishlist = [];
            }

            const existingItem = req.session.wishlist.find(item => item.destinationId === destinationId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.wishlist.push({
                    destinationId: destination.destinationId,
                    image: destination.image,
                    destinationName: destination.destinationName,
                    price: destination.price,
                    description: destination.description
                });
            }

            res.redirect('/wishlist');
        } else {
            res.status(404).send("Destination not found");
        }
    });
});

app.get('/editWishlist/:id', (req, res) => {
    const productId = req.params.id;    
    const sql = 'SELECT * FROM destination WHERE destinationId = ?';
    connection.query( sql, [destinationId], (error, results) => {
        if (error) {
            console.error('Database query error: ', error.message);
            res.status(500).send('Error retrieving product by ID');
        }
        if (results.length > 0) {
            res.render('editDestination', { product: results[0] });
        } else {
            res.status(404).send('Destination not found');
        }
    });
});

app.post('/wishlist/:id', checkAuthenticated, (req, res) => {
    const destinationId = req.params.id;
    const id = req.session.user.id;

    const insertSql = `
        INSERT INTO wishlist (id, destinationId)
        VALUES (?, ?)
    `;

    connection.query(insertSql, [id, destinationId, req.body.quantity || 1], (err, result) => {
        if (err) {
            console.error(err);
            req.flash('error', 'Failed to add to wishlist.');
            return res.redirect('/wishlist');
        }
        req.flash('success', 'Destination added to wishlist!');
        res.redirect('/wishlist');
    });
});



app.get('/wishlist', checkAuthenticated, (req, res) => {
    const userId = req.session.user.id;

    const sql = `
        SELECT wishlist.*, destination.destinationName, destination.price, destination.image
        FROM wishlist 
        JOIN destination ON wishlist.destinationId = destination.destinationId
        WHERE wishlist.id = ?
    `;

    connection.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("Database error when fetching wishlist:", err);
            return res.status(500).send("Error loading wishlist");
        }

        res.render('wishlist', {
            wishlist: results,
            user: req.session.user
        });
    });
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});


app.get('/destination/:id', checkAuthenticated, (req, res) => {
  const listId = req.params.id;

  connection.query('SELECT * FROM list WHERE listId = ?', [listId], (error, results) => {
      if (error) throw error;

      if (results.length > 0) {
          res.render('list', { list: results[0], user: req.session.user  });
      } else {
          res.status(404).send('list not found');
      }
  });
});

app.get('/list/:id/destinations', checkAuthenticated, (req, res) => {
  const listId = req.params.id;

  const sql = `
    SELECT *
    FROM destination
    WHERE listId = ?
  `;

  connection.query(sql, [listId], (error, results) => {
    if (error) throw error;

    res.render('destination', {
      destinations: results,
      user: req.session.user,
      list: { listId: req.params.id },  
    });
  });
});

app.get('/destination/:id/event', checkAuthenticated, (req, res) => {
  const eventId = req.params.id;

  const sql = 'SELECT * FROM destination WHERE destinationId = ?';

  connection.query(sql, [eventId], (error, results) => {
    if (error) throw error;

    if (results.length > 0) {
      res.render('event', { event: results[0], user: req.session.user });
    } else {
      res.status(404).send('Event not found');
    }
    });
});

app.get('/addCountry', checkAuthenticated, (req, res) => {
    res.render('addCountry', {user: req.session.user } ); 
});

app.post('/addCountry', upload.single('image'), (req, res) => {
    const { name } = req.body;  
    let image;
    if (req.file) {
        image = req.file.filename; 
    } else {
        image = null;
    }

    const sql = 'INSERT INTO country (countryName, image) VALUES (?, ?)';
    connection.query(sql, [name, image], (err, results) => {
        if (err) {
            console.error("Error adding country:", err);
            return res.status(500).send('Error adding country');
        }
        res.redirect('/country');  
    });
});
/////////////////////////////////////////
app.get('/updateCountry/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const countryId = req.params.id;
    const sql = 'SELECT * FROM country WHERE countryId = ?';

    connection.query(sql , [countryId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('editCountry', { country: results[0] });
        } else {
            res.status(404).send('Country not found');
        }
    });
});

app.post('/updateCountry/:id', upload.single('image'), (req, res) => {
    const countryId = req.params.id;
    const { countryName } = req.body;
    let image = req.body.currentImage;

    if (req.file) {
        image = req.file.filename;
    }

    const sql = 'UPDATE country SET countryName = ?, image = ? WHERE countryId = ?';
    connection.query(sql, [countryName, image, countryId], (error, results) => {
        if (error) {
            console.error("Error updating country:", error);
            res.status(500).send('Error updating country');
        } else {
            res.redirect('/country'); // or /country if that's your country listing page
        }
    });
});


app.get('/country/:id/addList', checkAuthenticated, (req, res) => {
    const countryId = req.params.id;
    const sql = 'SELECT * FROM country WHERE countryId = ?';

    connection.query(sql, [countryId], (err, results) => {
        if (err) return res.status(500).send('DB error');
        if (results.length === 0) return res.status(404).send('Country not found');

        res.render('addList', {
            user: req.session.user,
            country: results[0]
        });
    });
});

app.post('/country/:id/list/addList', upload.single('image'), (req, res) => {
  const listName = req.body.listName;
  const image = req.file.filename;
  const countryId = req.params.id;

  if (!countryId) {
    console.log("Country ID is missing");
    return res.status(400).send("Country ID required");
  }

  const sql = 'INSERT INTO list (image, listName, countryId) VALUES (?, ?, ?)';
  connection.query(sql, [image, listName, countryId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send("Database error.");
    }
    res.redirect(`/country/${countryId}/list`);
  });
});


app.get('/updateList/:id',checkAuthenticated, checkAdmin, (req,res) => {
    const listId = req.params.id;
    const sql = 'SELECT * FROM list WHERE listId = ?';

    connection.query(sql , [listId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            res.render('editlist', { list: results[0] });
        } else {
            res.status(404).send('list not found');
        }
    });
});

app.post('/updateList/:id', upload.single('image'), (req, res) => {
    const listId = req.params.id;
    const { name , countryId } = req.body;
    let image  = req.body.currentImage;

    if (req.file) {
        image = req.file.filename;
    }

    const sql = 'UPDATE list SET image = ?, listName = ?, countryId = ? WHERE listId = ?';

    connection.query(sql, [image, name, countryId, listId], (error, results) => {
        if (error) {
            console.error("Error updating List:", error);
            return res.status(500).send('Error updating List');
        }
        res.redirect(`/country/${countryId}/list`);
    });
});

app.get('/list/:id/addDestination', checkAuthenticated, (req, res) => {
    const listId = req.params.id;
    const sql = 'SELECT * FROM list WHERE listId = ?';

    connection.query(sql, [listId], (err, results) => {
        if (err) return res.status(500).send('DB error');
        if (results.length === 0) return res.status(404).send('List not found');

        res.render('addDestination', {
            user: req.session.user,
            list: results[0]
        });
    });
});

app.post('/list/:id/destinations/addDestination', upload.single('image'), (req, res) => {
    const destinationName = req.body.destinationName;
    const image = req.file.filename;
    const listId = req.params.id;
    const price = req.body.price;
    const description = req.body.description;

  if (!listId) {
    console.log("List ID is missing");
    return res.status(400).send("List ID required");
  }

  const sql = 'INSERT INTO destination (image, destinationName, price, description, listId) VALUES (?, ?, ?, ?, ?)';
  connection.query(sql, [image, destinationName, price, description, listId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send("Database error.");
    }
    res.redirect(`/list/${listId}/destinations`);
  });
});


app.get('/list/:listId/destinations/:destinationId/edit', checkAuthenticated, (req, res) => {
  const { listId, destinationId } = req.params;

  const sql = 'SELECT * FROM destination WHERE destinationId = ? AND listId = ?';
  connection.query(sql, [destinationId, listId], (err, results) => {
    if (err) return res.status(500).send('DB error');
    if (results.length === 0) return res.status(404).send('Destination not found');

    res.render('editDestination', {
      user: req.session.user,
      destination: results[0]
    });
  });
});

app.post('/list/:listId/destinations/:destinationId/edit', upload.single('image'), (req, res) => {
  const { listId, destinationId } = req.params;
  const { destinationName, price, description } = req.body;

  let image = req.body.currentImage; // default to current image
  if (req.file) {
    image = req.file.filename; // replace if a new one is uploaded
  }

  const sql = 'UPDATE destination SET image = ?, destinationName = ?, price = ?, description = ? WHERE destinationId = ? AND listId = ?';
  connection.query(sql, [image, destinationName, price, description, destinationId, listId], (err, results) => {
    if (err) {
      console.error(err);
      return res.send("Database error.");
    }
    res.redirect(`/list/${listId}/destinations`);
  });
});

app.get('/deleteWishlist/:id', (req, res) => {
    const wishlistId = req.params.id;
    const sql = 'DELETE FROM wishlist WHERE wishlistId = ?';
    connection.query(sql, [wishlistId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting wishlist:", error);
            res.status(500).send('Error deleting wishlist');
        } else {
            // Send a success response
            res.redirect('/wishlist');
        }
    });
});

app.post('/wishlist/delete/:id', checkAuthenticated, (req, res) => {
    const wishlistId = req.params.id;

    const sql = 'DELETE FROM wishlist WHERE wishlistId = ?';
    connection.query(sql, [wishlistId], (error, results) => {
        if (error) {
            console.error("Error deleting wishlist:", error);
            return res.status(500).send('Error deleting wishlist');
        }
        res.redirect('/wishlist');
    });
});

app.get('/deleteCountry/:id', (req, res) => {
    const countryId = req.params.id;
    const sql = 'DELETE FROM country WHERE countryId = ?';
    connection.query(sql, [countryId], (error, results) => {
        if (error) {
            // Handle any error that occurs during the database operation
            console.error("Error deleting country:", error);
            res.status(500).send('Error deleting country');
        } else {
            // Send a success response
            res.redirect('/country');
        }
    });
});

app.post('/country/deleteCountry/:id', checkAuthenticated, (req, res) => {
  const countryId = req.params.id;

  // Delete destinations related to the country (via lists)
  const deleteDestinationsSql = `
    DELETE d FROM destination d
    JOIN list l ON d.listId = l.listId
    WHERE l.countryId = ?
  `;

  connection.query(deleteDestinationsSql, [countryId], (err) => {
    if (err) {
      console.error("Error deleting destinations:", err);
      return res.status(500).send('Error deleting destinations');
    }

    // Delete lists related to the country
    const deleteListsSql = `DELETE FROM list WHERE countryId = ?`;
    connection.query(deleteListsSql, [countryId], (err) => {
      if (err) {
        console.error("Error deleting lists:", err);
        return res.status(500).send('Error deleting lists');
      }

      // Finally delete the country itself
      const deleteCountrySql = `DELETE FROM country WHERE countryId = ?`;
      connection.query(deleteCountrySql, [countryId], (err) => {
        if (err) {
          console.error("Error deleting country:", err);
          return res.status(500).send('Error deleting country');
        }

        // Redirect back to the countries page after successful deletion
        res.redirect('/country');
      });
    });
  });
});

app.get('/list/:listId/destinations/:destinationId/delete', (req, res) => {
  const { listId, destinationId } = req.params;

  const sql = 'DELETE FROM destination WHERE destinationId = ?';

  connection.query(sql, [destinationId], (err, result) => {
    if (err) {
      console.error('Error deleting destination:', err);
      return res.status(500).send('Database error');
    }

    // Redirect back to the same list
    res.redirect(`/list/${listId}/destinations`);
  });
});

app.post('/destination/delete/:id', checkAuthenticated, (req, res) => {
    const destinationId = req.params.id;

    const sql = 'DELETE FROM destination WHERE destinationId = ?';
    connection.query(sql, [destinationId], (error, results) => {
        if (error) {
            console.error("Error deleting destination:", error);
            return res.status(500).send('Error deleting destination');
        }
        res.redirect(`${listId}/destinations/delete`);
    });
});

app.get('/country/:countryId/list/:listId/delete', (req, res) => {
  const { countryId, listId } = req.params;

  const sql = 'DELETE FROM list WHERE listId = ?';

  connection.query(sql, [listId], (err, result) => {
    if (err) {
      console.error('Error deleting list:', err);
      return res.status(500).send('Database error');
    }

    // Redirect back to the same list
    res.redirect(`/country/${countryId}/list`);
  });
});

app.post('/list/delete/:id', checkAuthenticated, (req, res) => {
    const listId = req.params.id;

    // First, delete all destinations in that list
    const deleteDestinationsSql = 'DELETE FROM destination WHERE listId = ?';
    connection.query(deleteDestinationsSql, [listId], (err, results) => {
        if (err) {
            console.error("Error deleting destinations:", err);
            return res.status(500).send('Error deleting destinations');
        }

        // Now delete the list itself
        const deleteListSql = 'DELETE FROM list WHERE listId = ?';
        connection.query(deleteListSql, [listId], (err, results) => {
            if (err) {
                console.error("Error deleting list:", err);
                return res.status(500).send('Error deleting list');
            }

            // If you pass the countryId from the form, use it to redirect
            const countryId = req.body.countryId || ''; // Add a hidden field in your form
            res.redirect(`/country/${countryId}/list`);
        });
    });
});

app.get('/search', (req, res) => {
  const searchTerm = req.query.q;
  const sql = "SELECT * FROM country WHERE countryName LIKE ?";
  connection.query(sql, [`%${searchTerm}%`], (err, results) => {
    if (err) throw err;
    res.render('search', { results, user: req.session.user, searchTerm });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
